/* Vercel serverless function: GET /api/status?id=<generation id>
 *
 * Proxies a generation status check to the Luma Agents API.
 * The user's own Luma API key arrives per request in the Authorization
 * header ("Bearer <key>") and is forwarded verbatim to Luma.
 * It is never logged, never stored, and never sent anywhere else.
 *
 * Success while running: { "state": "queued" | "dreaming" | ... }
 * Success when done:     { "state": "completed", "video_url": "https://..." }
 * Failed:                { "state": "failed", "error": "<reason>" }
 *
 * Note: Luma returns presigned video URLs that expire after ~1 hour,
 * so the client plays the video immediately on completion.
 */

const LUMA_BASE = "https://agents.lumalabs.ai/v1";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.length < 12) {
    res.status(401).json({ error: "Missing Luma API key" });
    return;
  }

  const id = ((req.query && req.query.id) || "").toString().trim();
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }

  let lumaRes;
  try {
    lumaRes = await fetch(LUMA_BASE + "/generations/" + encodeURIComponent(id), {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "User-Agent": "dreamrecorder-launch/1.0",
      },
    });
  } catch (e) {
    res.status(502).json({ error: "Could not reach Luma — please try again." });
    return;
  }

  const data = await lumaRes.json().catch(function () { return {}; });

  if (!lumaRes.ok) {
    const message =
      data.message || data.error || data.detail || "Luma rejected the request.";
    res.status(lumaRes.status === 401 ? 401 : 502).json({ error: message });
    return;
  }

  const state = data.state || "unknown";

  if (state === "completed") {
    const outputs = Array.isArray(data.output) ? data.output : [];
    const videoUrl = outputs.length && outputs[0].url ? outputs[0].url : null;
    if (!videoUrl) {
      res.status(502).json({ error: "Luma finished but returned no video URL." });
      return;
    }
    res.status(200).json({ state: state, video_url: videoUrl });
    return;
  }

  if (state === "failed") {
    res.status(200).json({
      state: state,
      error: data.failure_reason || data.failure_code || "The video generation failed.",
    });
    return;
  }

  res.status(200).json({ state: state });
};
