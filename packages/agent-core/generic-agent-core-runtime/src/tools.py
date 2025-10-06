"""Tool management for the agent core runtime."""

import json
import logging
import os
from typing import Any

import boto3
from strands import tool

from .config import WORKSPACE_DIR, get_aws_credentials, get_uv_environment

# Import strands-agents code interpreter tool
try:
    from strands_tools.code_interpreter import AgentCoreCodeInterpreter

    CODE_INTERPRETER_AVAILABLE = True
except ImportError as e:
    CODE_INTERPRETER_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning(f"Strands code interpreter tool not available: {e}")
    AgentCoreCodeInterpreter = None

logger = logging.getLogger(__name__)


class ToolManager:
    """Manages tools including built-in tools."""

    def __init__(self):
        self.session_id = None
        self.trace_id = None

    def set_session_info(self, session_id: str, trace_id: str):
        """Set session and trace IDs for tool operations"""
        self.session_id = session_id
        self.trace_id = trace_id


    def get_upload_tool(self):
        """Get the S3 upload tool with session context"""
        trace_id = self.trace_id

        @tool
        def upload_file_to_s3_and_retrieve_s3_url(filepath: str) -> str:
            """Upload the file at /tmp/ws/* and retrieve the s3 path

            Args:
                filepath: The path to the uploading file
            """
            bucket = os.environ.get("FILE_BUCKET")
            if not bucket:
                # For local testing, provide a fallback message
                logger.warning("FILE_BUCKET environment variable not set. Using local file path for testing.")
                return f"Local file path (S3 upload skipped): {filepath}"

            aws_creds = get_aws_credentials()
            region = aws_creds.get("AWS_REGION", "us-east-1")

            if not filepath.startswith(WORKSPACE_DIR):
                raise ValueError(f"{filepath} does not appear to be a file under the {WORKSPACE_DIR} directory. Files to be uploaded must exist under {WORKSPACE_DIR}.")

            try:
                filename = os.path.basename(filepath)
                key = f"agentcore/{trace_id}/{filename}"

                s3 = boto3.client("s3", region_name=region)
                s3.upload_file(filepath, bucket, key)

                return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
            except Exception as e:
                logger.error(f"Error uploading file to S3: {e}")
                # For local testing, provide a fallback
                return f"Error uploading to S3: {str(e)}. Local file path: {filepath}"

        return upload_file_to_s3_and_retrieve_s3_url

    def get_code_interpreter_tool(self) -> list[Any]:
        """Get code interpreter tool if available"""
        code_interpreter_tools = []

        if CODE_INTERPRETER_AVAILABLE and AgentCoreCodeInterpreter:
            try:
                aws_creds = get_aws_credentials()
                region = aws_creds.get("AWS_REGION", "us-east-1")
                code_interpreter = AgentCoreCodeInterpreter(region=region)
                code_interpreter_tools.append(code_interpreter.code_interpreter)
                logger.info("Added code_interpreter tool (AgentCoreCodeInterpreter)")
            except Exception as e:
                logger.warning(f"Failed to initialize AgentCoreCodeInterpreter: {e}")

        return code_interpreter_tools

    def get_all_tools(self) -> list[Any]:
        """Get all available tools (built-in + code interpreter)"""
        upload_tool = self.get_upload_tool()
        code_interpreter_tools = self.get_code_interpreter_tool()

        all_tools = [upload_tool] + code_interpreter_tools
        logger.info(f"Total tools loaded: {len(all_tools)} (Built-in: 1, Code Interpreter: {len(code_interpreter_tools)})")

        return all_tools
