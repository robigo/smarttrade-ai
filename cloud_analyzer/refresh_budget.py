"""Shared research request reservations, persisted before provider calls."""

def reserve(state, snapshots, expected, now, symbols):
    stamp = now.timestamp()
    if state.get("cooldown", 0) > stamp:
        return None
    requests = [item for item in state.get("requests", [])
                if item[0] == expected or item[1] > stamp - 60]
    if sum(item[0] == expected for item in requests) >= 40:
        return None
    if sum(item[1] > stamp - 60 for item in requests) >= 8:
        return None
    attempts = state.setdefault("attempts", {})
    for symbol in symbols:
        snapshot = snapshots.get(symbol, {})
        attempt = attempts.get(symbol, {})
        if snapshot.get("dataDate", "") >= expected or attempt.get("retryAfter", 0) > stamp:
            continue
        requests.append([expected, stamp])
        state["requests"] = requests
        attempts[symbol] = {"startedAt": now.isoformat(), "status": "in_progress",
                            "retryAfter": stamp + 300}
        return symbol
    return None
