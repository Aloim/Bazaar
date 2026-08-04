# autoload/game_manager.gd
extends Node
## Autoload: GameManager
##
## Single source of truth for the current player's session state.
## Populated on INIT_STATE and updated incrementally by subsequent messages.
## Other scripts should READ from here rather than caching state themselves.
##
## Does NOT contain game-world logic — that lives in the world-node scripts.

# ---------------------------------------------------------------------------
# Wallet state
# ---------------------------------------------------------------------------

var wallet_connected: bool = false
var wallet_address: String = ""

# ---------------------------------------------------------------------------
# Role state — v1 aliases (Constitution XII.5 naming; spec §7.1 InitRoles)
# ---------------------------------------------------------------------------

## SSU capability tier (4-tier per Constitution XII.2)
var is_ssu_owner: bool = false
var is_ssu_super_admin: bool = false   # FP1-25; stub-false until FP1-23 RPC lands
var is_ssu_admin: bool = false
var is_ssu_mod: bool = false

## Tribe capability tier (4-tier per Constitution XII.2)
var is_tribe_leader: bool = false
var is_tribe_super_admin: bool = false
var is_tribe_admin: bool = false
var is_tribe_mod: bool = false

## Membership flag (not a capability)
var is_tribe_member: bool = false

## Legacy aliases — preserved for hud.gd:175-176 and any other existing reader.
## These mirror the primary v1 fields; rename deferred to future hardening pass.
## SQ-1: additive shim; Constitution IX.1 additive-over-breaking.
var is_owner: bool = false      # mirrors is_ssu_owner
var is_admin: bool = false      # mirrors is_ssu_admin
var is_moderator: bool = false  # mirrors is_ssu_mod
var is_member: bool = false     # mirrors is_tribe_member

var market_role: String = "Unassigned"

# ---------------------------------------------------------------------------
# Economy state
# ---------------------------------------------------------------------------

var balance: int = 0

# ---------------------------------------------------------------------------
# SSU state
# ---------------------------------------------------------------------------

## The SSU the user is currently docked at, passed from React via INIT_STATE
## or WALLET_CONNECTED. Empty string when unknown (browser user without ?itemId=).
var current_ssu_id: String = ""

# ---------------------------------------------------------------------------
# Restriction state
# ---------------------------------------------------------------------------

var is_banned: bool = false
var ban_expiry_ms: int = 0  # 0 = permanent when is_banned is true

# ---------------------------------------------------------------------------
# Trade state
# ---------------------------------------------------------------------------

## Raw Array of TradeProposal Dictionaries, keyed by API spec §5.4.
var trade_proposals: Array = []

# ---------------------------------------------------------------------------
# Inventory state
# ---------------------------------------------------------------------------

## Raw Array of item Dictionaries received via INVENTORY_UPDATED.
## Each item carries keys: typeId, quantity, volume, lockedQuantity, lockingShopId.
var inventory_items: Array = []

# ---------------------------------------------------------------------------
# Derived helpers (computed properties)
# ---------------------------------------------------------------------------

## True when the connected wallet has any elevated SSU privilege.
## Updated per GQ-5: includes is_ssu_super_admin as explicit named check.
func has_elevated_role() -> bool:
	return is_ssu_owner or is_ssu_super_admin or is_ssu_admin or is_ssu_mod

## True when the player can interact with shops, place new shops, etc.
func can_interact() -> bool:
	return wallet_connected and not is_banned

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	EventBus.init_state_received.connect(_on_init_state_received)
	EventBus.wallet_connected.connect(_on_wallet_connected)
	EventBus.wallet_disconnected.connect(_on_wallet_disconnected)
	EventBus.balance_updated.connect(_on_balance_updated)
	EventBus.trade_proposals_updated.connect(_on_trade_proposals_updated)
	EventBus.player_banned.connect(_on_player_banned)
	EventBus.inventory_updated.connect(_on_inventory_updated)

# ---------------------------------------------------------------------------
# Signal handlers
# ---------------------------------------------------------------------------

func _on_init_state_received(payload: Dictionary) -> void:
	# PREP-4 / SDC-001: v1 init uses flat walletAddress (not nested wallet object).
	# Derive connected from walletAddress != null (spec §7.1).
	var raw_wallet_address: Variant = payload.get("walletAddress", null)
	wallet_connected = (raw_wallet_address != null)
	wallet_address = "" if raw_wallet_address == null else str(raw_wallet_address)

	var roles: Dictionary = payload.get("roles", {})
	_apply_roles(roles)

	market_role = str(payload.get("marketRole", "Unassigned"))
	balance = int(payload.get("balance", 0))
	is_banned = bool(payload.get("isBanned", false))
	trade_proposals = payload.get("tradeProposals", [])
	# PREP-4 / SDC-001: v1 uses "ssuId" not "currentSsuId".
	current_ssu_id = str(payload.get("ssuId", ""))

func _on_wallet_connected(p: Dictionary) -> void:
	wallet_connected = true
	wallet_address = str(p.get("address", ""))
	_apply_roles(p.get("roles", {}))
	market_role = str(p.get("marketRole", "Unassigned"))
	is_banned = bool(p.get("isBanned", false))
	# PREP-4 / SDC-001: wallet_connected payload uses "address" only (spec §8.1).
	# ssuId is carried only in the init envelope; retain existing current_ssu_id.

func _on_wallet_disconnected() -> void:
	wallet_connected = false
	wallet_address = ""
	# Clear v1 aliases
	is_ssu_owner = false
	is_ssu_super_admin = false
	is_ssu_admin = false
	is_ssu_mod = false
	is_tribe_leader = false
	is_tribe_super_admin = false
	is_tribe_admin = false
	is_tribe_mod = false
	is_tribe_member = false
	# Clear legacy aliases (mirrors)
	is_owner = false
	is_admin = false
	is_moderator = false
	is_member = false
	market_role = "Unassigned"
	balance = 0
	is_banned = false
	ban_expiry_ms = 0
	current_ssu_id = ""

func _on_balance_updated(new_balance: int) -> void:
	balance = new_balance

func _on_trade_proposals_updated(proposals: Array) -> void:
	trade_proposals = proposals

func _on_player_banned(p: Dictionary) -> void:
	is_banned = true
	ban_expiry_ms = int(p.get("expiryMs", 0))

func _on_inventory_updated(items: Array) -> void:
	inventory_items = items

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

func _apply_roles(roles: Dictionary) -> void:
	# PREP-1: Read v1 role keys (Constitution XII.5; spec §7.1 InitRoles).
	# SSU capability tier
	is_ssu_owner       = bool(roles.get("isSSUOwner", false))
	is_ssu_super_admin = bool(roles.get("isSSUSuperAdmin", false))
	is_ssu_admin       = bool(roles.get("isSSUAdmin", false))
	is_ssu_mod         = bool(roles.get("isSSUMod", false))
	# Tribe capability tier
	is_tribe_leader      = bool(roles.get("isTribeLeader", false))
	is_tribe_super_admin = bool(roles.get("isTribeSuperAdmin", false))
	is_tribe_admin       = bool(roles.get("isTribeAdmin", false))
	is_tribe_mod         = bool(roles.get("isTribeMod", false))
	# Membership flag
	is_tribe_member = bool(roles.get("isTribeMember", false))
	# SQ-1 legacy aliases: mirror primary fields so hud.gd:175-176 keeps working.
	# Rename deferred to future hardening pass (minimum-blast-radius per user direction).
	is_owner    = is_ssu_owner
	is_admin    = is_ssu_admin
	is_moderator = is_ssu_mod
	is_member   = is_tribe_member
