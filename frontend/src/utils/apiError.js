export async function extractErrorMessage(res) {
  const text = await res.text().catch(() => '');
  const contentType = res.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = JSON.parse(text);
      if (typeof body?.detail === 'string') return body.detail;
      if (body?.detail != null) return JSON.stringify(body.detail);
      if (body != null) return JSON.stringify(body);
    } catch {
      // fall through to raw text
    }
  }
  return text;
}
