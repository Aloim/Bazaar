# ============================================================
# If this file reaches more than 500 lines, split it into
# 2 or more files to prevent bloating. Code belongs BELOW.
# ============================================================

# scripts/bridge/envelope.gd
class_name Envelope
extends Node
## Bridge: Envelope Parser and Builder
##
## Owns the PROTOCOL_VERSION constant and the two primitive operations on
## the invariant three-field JSON envelope: {type, version, payload}.
##
## parse_envelope: String -> Dictionary  (inbound, returns {} on any error)
## build_envelope: (String, Dictionary) -> String  (outbound, returns JSON string)
##
## DOUBLE-STRINGIFY PATTERN — LOAD-BEARING (GQ-2):
##   build_envelope returns a JSON string, NOT a raw object.
##   event_emitter._send_to_react then calls JSON.stringify(envelope_string)
##   a SECOND time so that the CustomEvent detail field receives a quoted,
##   escaped string literal. React then JSON.parses it from
##   (e as CustomEvent<string>).detail.
##   Removing either stringify breaks the React receive path. Do not simplify.
##
## GQ-1 MANDATE: GDScript JSON.parse_string returns all numerics as float.
##   Callers (command_dispatcher.gd) are responsible for int() casts on every
##   integer field enumerated in spec §2.4. This file makes no casts — it
##   returns the raw parsed Dictionary.
##
## NULL-GUARD PATTERN (§2.5):
##   Nullable string fields (walletAddress, tribeId) require:
##     var v = "" if payload.get("key") == null else str(payload.get("key"))
##   Naive str(null_variant) produces literal "<null>" in Godot 4.x.
##
## Protocol version lives here. Both sides MUST update in lockstep on MAJOR bump.
## GQ-3-FUTURE: eval-free CustomEvent dispatch via JavaScriptObject is a v1.1
##   candidate (see GS §2.GQ-3). Retained as a tech-note; no action at v1.0.
##
## Article VII: This file executes no user-supplied code and has no network access.
## Constitution XIV.4: 500-line guard enforced.

# ---------------------------------------------------------------------------
# Protocol version
# ---------------------------------------------------------------------------

## Canonical protocol version for this Godot build.
## React reads this from the protocol_handshake_ack payload.version field.
## Receivers MUST compare MAJOR component only for compatibility gating.
const PROTOCOL_VERSION := "1.0.0"

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Parse a raw JSON string into a {type, version, payload} Dictionary.
## Returns an empty Dictionary on any parse failure:
##   - Not valid JSON
##   - Top level is not a Dictionary
##   - Missing "type" key or "type" is not a String
## Forward-compatibility: unknown "type" values are NOT rejected here;
## command_dispatcher silently drops them in its match default branch.
static func parse_envelope(raw: String) -> Dictionary:
	if raw.is_empty():
		return {}
	var parsed: Variant = JSON.parse_string(raw)
	if parsed == null or not (parsed is Dictionary):
		return {}
	var d: Dictionary = parsed as Dictionary
	if not d.has("type") or not (d["type"] is String):
		return {}
	var env_type: String = d["type"]
	if env_type.is_empty():
		return {}
	# version is optional for legacy READY tolerance (spec §5.2 / §3.3)
	var env_version: String = str(d.get("version", "0.x"))
	# payload must be a Dictionary; tolerate absent payload as {}
	var raw_payload: Variant = d.get("payload", {})
	var env_payload: Dictionary = raw_payload if (raw_payload is Dictionary) else {}
	return {"type": env_type, "version": env_version, "payload": env_payload}

## Build an outbound envelope JSON string.
## Returns a JSON string of {type, version, payload}.
## See module header: event_emitter double-stringifies this for CustomEvent detail.
static func build_envelope(env_type: String, payload: Dictionary) -> String:
	return JSON.stringify({
		"type": env_type,
		"version": PROTOCOL_VERSION,
		"payload": payload
	})

# ---------------------------------------------------------------------------
# Null-guard helper (spec §2.5)
# ---------------------------------------------------------------------------

## Convert a potentially-null Variant (from JSON parse) to a safe String.
## Returns "" for null; str(value) for all other values.
## Prevents literal "<null>" from appearing in nullable string fields.
static func null_str(value: Variant) -> String:
	if value == null:
		return ""
	return str(value)

# ---------------------------------------------------------------------------
# 500-line guard (Constitution Article XIV.4)
# If this file approaches 500 lines, extract helpers to envelope_helpers.gd.
# ---------------------------------------------------------------------------
