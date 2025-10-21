"""Bedrock RAG Repository Implementation"""

import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError

from models.rag import RAGQuery, RAGStreamChunk, RetrievedDocument
from repositories.rag_repository import RAGRepository

logger = logging.getLogger(__name__)


@dataclass
class GenerationConfig:
    """Bedrock generation configuration"""

    temperature: float | None = None
    max_tokens: int | None = None
    top_p: float | None = None
    stop_sequences: list[str] | None = None

    @classmethod
    def from_model_config(cls, model_config: dict) -> "GenerationConfig":
        """Create from model configuration dict"""
        return cls(
            temperature=model_config.get("temperature"),
            max_tokens=model_config.get("maxTokens"),
            top_p=model_config.get("topP"),
            stop_sequences=model_config.get("stopSequences"),
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for Bedrock API"""
        result: dict = {}
        if self.temperature is not None:
            result["temperature"] = self.temperature
        if self.max_tokens is not None:
            result["maxTokens"] = self.max_tokens
        if self.top_p is not None:
            result["topP"] = self.top_p
        if self.stop_sequences is not None:
            result["stopSequences"] = self.stop_sequences
        return result


@dataclass
class KnowledgeBaseConfig:
    """Bedrock knowledge base configuration"""

    knowledge_base_id: str
    model_arn: str
    generation_config: GenerationConfig | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary for Bedrock API"""
        result: dict = {
            "knowledgeBaseId": self.knowledge_base_id,
            "modelArn": self.model_arn,
        }
        if self.generation_config:
            result["generationConfiguration"] = self.generation_config.to_dict()
        return result


@dataclass
class RetrieveAndGenerateConfig:
    """Bedrock retrieve and generate configuration"""

    type: str
    knowledge_base_config: KnowledgeBaseConfig

    def to_dict(self) -> dict:
        """Convert to dictionary for Bedrock API"""
        return {
            "type": self.type,
            "knowledgeBaseConfiguration": self.knowledge_base_config.to_dict(),
        }


@dataclass
class BedrockRAGRequest:
    """Bedrock RAG request structure"""

    input_text: str
    retrieve_and_generate_config: RetrieveAndGenerateConfig

    def to_dict(self) -> dict:
        """Convert to dictionary for Bedrock API"""
        return {
            "input": {"text": self.input_text},
            "retrieveAndGenerateConfiguration": self.retrieve_and_generate_config.to_dict(),
        }


class BedrockRAGRepository(RAGRepository):
    """Bedrock Knowledge Base implementation of RAG repository"""

    def __init__(self, aws_region: str = "ap-northeast-1"):
        self.aws_region = aws_region
        self.bedrock_agent = boto3.client(
            "bedrock-agent-runtime", region_name=aws_region
        )
        self.bedrock_runtime = boto3.client("bedrock-runtime", region_name=aws_region)

    async def retrieve_documents(self, query: RAGQuery) -> list[RetrievedDocument]:
        """Retrieve documents from Bedrock Knowledge Base"""
        try:
            response = self.bedrock_agent.retrieve(
                knowledgeBaseId=query.knowledge_base_id,
                retrievalQuery={"text": query.query},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {"numberOfResults": query.max_results}
                },
            )

            documents = []
            for result in response.get("retrievalResults", []):
                # Extract document information
                content = result.get("content", {}).get("text", "")
                source = result.get("location", {}).get("s3Location", {}).get("uri", "")
                confidence_score = result.get("score", 0.0)

                # Extract metadata
                metadata = {
                    "location": result.get("location", {}),
                    "metadata": result.get("metadata", {}),
                }

                # Filter by confidence threshold
                if confidence_score >= query.confidence_threshold:
                    documents.append(
                        RetrievedDocument(
                            content=content,
                            source=source,
                            confidence_score=confidence_score,
                            metadata=metadata,
                        )
                    )

            logger.info(
                f"Retrieved {len(documents)} documents for query: {query.query[:50]}"
            )
            return documents

        except ClientError as e:
            logger.error(f"Bedrock retrieve error: {e}")
            raise Exception(f"Failed to retrieve documents: {e}")

    async def retrieve_and_generate(
        self,
        query: str,
        knowledge_base_id: str,
        model_config: dict | None = None,
    ) -> AsyncGenerator[RAGStreamChunk]:
        """Retrieve documents and generate streaming response using Bedrock"""
        try:
            # First yield retrieval status
            yield RAGStreamChunk(
                type="retrieval", content="Searching knowledge base..."
            )

            # Default model configuration
            model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"
            if model_config and model_config.get("modelId"):
                model_id = model_config["modelId"]

            # Build type-safe generation configuration
            generation_config = None
            if model_config:
                generation_config = GenerationConfig.from_model_config(model_config)

            # Build type-safe request structure
            knowledge_base_config = KnowledgeBaseConfig(
                knowledge_base_id=knowledge_base_id,
                model_arn=f"arn:aws:bedrock:{self.aws_region}::foundation-model/{model_id}",
                generation_config=generation_config,
            )

            retrieve_and_generate_config = RetrieveAndGenerateConfig(
                type="KNOWLEDGE_BASE", knowledge_base_config=knowledge_base_config
            )

            bedrock_request = BedrockRAGRequest(
                input_text=query,
                retrieve_and_generate_config=retrieve_and_generate_config,
            )

            # Call Bedrock retrieve and generate with streaming
            response = self.bedrock_agent.retrieve_and_generate_stream(
                **bedrock_request.to_dict()
            )

            # Track retrieved documents
            retrieved_documents = []

            # Stream the response
            for event in response["stream"]:
                if "chunk" in event:
                    chunk_data = event["chunk"]

                    # Handle different chunk types
                    if "bytes" in chunk_data:
                        chunk_bytes = chunk_data["bytes"]
                        chunk_str = chunk_bytes.decode("utf-8")

                        try:
                            chunk_json = json.loads(chunk_str)

                            # Handle streaming tokens
                            if "completion" in chunk_json:
                                yield RAGStreamChunk(
                                    type="token", token=chunk_json["completion"]
                                )

                            # Handle citations/sources
                            if "citations" in chunk_json:
                                citations = chunk_json["citations"]
                                for citation in citations:
                                    retrieved_references = citation.get(
                                        "retrievedReferences", []
                                    )
                                    for ref in retrieved_references:
                                        content = ref.get("content", {}).get("text", "")
                                        source = (
                                            ref.get("location", {})
                                            .get("s3Location", {})
                                            .get("uri", "")
                                        )
                                        metadata = {
                                            "location": ref.get("location", {}),
                                            "metadata": ref.get("metadata", {}),
                                        }

                                        retrieved_documents.append(
                                            RetrievedDocument(
                                                content=content,
                                                source=source,
                                                confidence_score=1.0,  # Bedrock doesn't provide scores in streaming
                                                metadata=metadata,
                                            )
                                        )

                                # Yield retrieved documents
                                if retrieved_documents:
                                    yield RAGStreamChunk(
                                        type="retrieval", documents=retrieved_documents
                                    )

                        except json.JSONDecodeError:
                            # If not JSON, treat as raw text token
                            yield RAGStreamChunk(type="token", token=chunk_str)

                elif "metadata" in event:
                    # Handle metadata
                    metadata = event["metadata"]
                    yield RAGStreamChunk(type="metadata", metadata=metadata)

            # Send completion signal
            yield RAGStreamChunk(type="done")

        except ClientError as e:
            error_msg = f"Bedrock RAG error: {e}"
            logger.error(error_msg)
            yield RAGStreamChunk(type="error", error=error_msg)
        except Exception as e:
            error_msg = f"RAG processing error: {e}"
            logger.error(error_msg)
            yield RAGStreamChunk(type="error", error=error_msg)

    async def health_check(self) -> bool:
        """Check if Bedrock services are accessible"""
        try:
            # Simple test to check if we can access bedrock-agent service
            self.bedrock_agent.list_knowledge_bases(maxResults=1)
            return True
        except ClientError as e:
            logger.error(f"Bedrock health check failed: {e}")
            return False
