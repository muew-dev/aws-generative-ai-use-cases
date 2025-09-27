const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Bedrock Invoke Model API Mock
app.post('/model/*/invoke', (req, res) => {
  const { body } = req.body;
  const parsedBody = JSON.parse(body);
  
  // Claude Anthropicモデルのレスポンスをモック
  const mockResponse = {
    completion: `これはモックレスポンスです。入力: ${parsedBody.prompt}`,
    stop_reason: "stop_sequence",
    stop_sequence: "\\n\\nHuman:"
  };

  res.json(mockResponse);
});

// Bedrock Invoke Model Stream API Mock
app.post('/model/*/invoke-with-response-stream', (req, res) => {
  res.setHeader('Content-Type', 'application/x-amzn-eventstream');
  res.setHeader('Transfer-Encoding', 'chunked');

  const mockChunks = [
    'これは',
    'モック',
    'ストリーム',
    'レスポンス',
    'です。'
  ];

  let index = 0;
  const interval = setInterval(() => {
    if (index < mockChunks.length) {
      const chunk = {
        chunk: {
          bytes: Buffer.from(JSON.stringify({
            completion: mockChunks[index],
            stop_reason: null
          })).toString('base64')
        }
      };
      res.write(JSON.stringify(chunk) + '\n');
      index++;
    } else {
      clearInterval(interval);
      res.end();
    }
  }, 100);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Bedrock Mock Server' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Bedrock Mock Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});