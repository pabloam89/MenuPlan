import { Redis } from "@upstash/redis";

// Redis.fromEnv() only looks for UPSTASH_REDIS_REST_URL/_TOKEN. The Vercel
// integration for this project provisioned them as UPSTASH_REDIS_KV_REST_API_*
// instead (name picked when the Redis resource was connected), so fromEnv()
// silently found nothing and every request 500'd. Read explicitly, falling
// back to the standard names in case a future/other env uses them.
const redis = new Redis({
  url:
    process.env.UPSTASH_REDIS_KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.UPSTASH_REDIS_KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN,
});
const KEY_STATE  = "dish:approvals"; // hash: combo_id → "approved" | "rejected"
const KEY_REASON = "dish:reasons";   // hash: combo_id → reason string

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ── GET: return merged { combo_id: { state, reason? } } ──────────────
    if (req.method === "GET") {
      const [states, reasons] = await Promise.all([
        redis.hgetall(KEY_STATE),
        redis.hgetall(KEY_REASON),
      ]);
      const merged = {};
      for (const [id, state] of Object.entries(states ?? {})) {
        merged[id] = { state };
        if (reasons?.[id]) merged[id].reason = reasons[id];
      }
      return res.status(200).json(merged);
    }

    // ── POST ─────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const body = req.body ?? {};

      // Batch: { batch: [{ id, state, reason? }, ...] }
      if (Array.isArray(body.batch)) {
        const toSetState  = {};
        const toSetReason = {};
        const toDelState  = [];
        const toDelReason = [];

        for (const { id, state, reason } of body.batch) {
          if (!id) continue;
          if (state) {
            toSetState[id] = state;
            if (reason) toSetReason[id] = reason;
            else toDelReason.push(id);
          } else {
            toDelState.push(id);
            toDelReason.push(id);
          }
        }

        const ops = [];
        if (Object.keys(toSetState).length)  ops.push(redis.hset(KEY_STATE,  toSetState));
        if (Object.keys(toSetReason).length) ops.push(redis.hset(KEY_REASON, toSetReason));
        if (toDelState.length)  ops.push(redis.hdel(KEY_STATE,  ...toDelState));
        if (toDelReason.length) ops.push(redis.hdel(KEY_REASON, ...toDelReason));
        await Promise.all(ops);
        return res.status(200).json({ ok: true });
      }

      // Single: { id, state, reason? }
      const { id, state, reason } = body;
      if (!id) return res.status(400).json({ error: "id required" });

      if (state) {
        await redis.hset(KEY_STATE, { [id]: state });
        if (reason) await redis.hset(KEY_REASON, { [id]: reason });
        else await redis.hdel(KEY_REASON, id);
      } else {
        await Promise.all([
          redis.hdel(KEY_STATE,  id),
          redis.hdel(KEY_REASON, id),
        ]);
      }
      return res.status(200).json({ ok: true });
    }

    // ── DELETE: reset all ─────────────────────────────────────────────────
    if (req.method === "DELETE") {
      await Promise.all([redis.del(KEY_STATE), redis.del(KEY_REASON)]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[approvals]", err);
    return res.status(500).json({ error: err.message });
  }
}
