module.exports = {
  test: (val: unknown) => typeof val === 'string',
  serialize: (val: string) => {
    return `"${val
      .replace(/([A-Fa-f0-9]{64}\.zip)/, 'HASH-REPLACED.zip')
      .replace(
        /([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})/,
        'UUID-REPLACED'
      )
      .replace(/(\d{12})/, 'ACCOUNT-REPLACED')
      .replace(/(generative-ai-[\w-]+)-([a-f0-9]+)/, '$1-HASH-REPLACED')
      .replace(/TOKEN\.\d+/g, 'TOKEN.NORMALIZED')
      .replace(/:[a-f0-9]{64}/g, ':DOCKER-IMAGE-HASH-NORMALIZED')}"`;
  },
};
