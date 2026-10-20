/* Vercel serverless function: POST /api/generate
 *
 * Proxies a text-to-video request to the Luma Agents API.
 * The user's own Luma API key arrives per request in the Authorization
 * header ("Bearer <key>") and is forwarded verbatim to Luma.
 * It is never logged, never stored, and never sent anywhere else.
 *
 * Request body:  { "prompt": "dream description" }
 * Success:       { "id": "<luma generation id>" }
 */

const LUMA_BASE = "https://agents.lumalabs.ai/v1";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.length < 12) {
    res.status(401).json({ error: "Missing Luma API key" });
    return;
  }

  const body = readBody(req);
  const prompt = (body.prompt || "").toString().trim();
  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  let lumaRes;
  try {
    lumaRes = await fetch(LUMA_BASE + "/generations", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "dreamrecorder-launch/1.0",
      },
      body: JSON.stringify({
        model: "ray-3.2",
        type: "video",
        prompt: prompt,
        aspect_ratio: "21:9",
        video: {
          resolution: "540p",
          duration: "10s",
          loop: false, // Luma rejects loop=true at 10s; the client loops playback itself
        },
      }),
    });
  } catch (e) {
    res.status(502).json({ error: "Could not reach Luma — please try again." });
    return;
  }

  const data = await lumaRes.json().catch(function () { return {}; });

  if (!lumaRes.ok) {
    const message =
      data.message || data.error || data.detail || "Luma rejected the request.";
    // 401 from Luma means the user's key is invalid — surface it plainly.
    res.status(lumaRes.status === 401 ? 401 : 502).json({ error: message });
    return;
  }

  if (!data.id) {
    res.status(502).json({ error: "Luma did not return a generation id." });
    return;
  }

  res.status(200).json({ id: data.id });
};
