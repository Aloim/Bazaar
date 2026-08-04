# scripts/hud.gd
extends CanvasLayer
## HUD overlay — balance, wallet address, role badge, panel buttons, toast.
##
## Reads initial state from GameManager and updates reactively via EventBus
## signals. Buttons emit EventBus signals or call Bridge directly.
##
## Attach to: CanvasLayer (HUD scene root).
##
## Required children (exact names):
##   Panel/VBoxContainer/
##     BalanceLabel        : Label
##     AddressLabel        : Label
##     RoleBadge           : Label
##     BtnTrade            : Button   (badge count overlay handled via text)
##     BtnInventory        : Button
##     BtnAdmin            : Button
##     BtnMod              : Button
##     BtnPlaceShop        : Button
##   ToastContainer        : VBoxContainer (anchored top-right or bottom)
##   BannedOverlay         : Control (full-screen, hidden by default)
##     BannedLabel         : Label

# ---------------------------------------------------------------------------
# Toast configuration
# ---------------------------------------------------------------------------

const TOAST_DURATION: float = 3.5
const COLOR_TOAST_SUCCESS: Color = Color(0.2, 0.85, 0.3)
const COLOR_TOAST_FAILURE: Color = Color(0.9, 0.25, 0.25)
const COLOR_TOAST_SYSTEM:  Color = Color(0.95, 0.75, 0.1)

## System lifecycle actions that should show as yellow toasts.
const SYSTEM_ACTIONS: Array[String] = ["shop_expired", "shop_depleted"]

# ---------------------------------------------------------------------------
# Node references
# ---------------------------------------------------------------------------

@onready var _balance_label: Label       = $Panel/VBoxContainer/BalanceLabel
@onready var _address_label: Label       = $Panel/VBoxContainer/AddressLabel
@onready var _role_badge: Label          = $Panel/VBoxContainer/RoleBadge
@onready var _btn_trade: Button          = $Panel/VBoxContainer/BtnTrade
@onready var _btn_inventory: Button      = $Panel/VBoxContainer/BtnInventory
@onready var _btn_admin: Button          = $Panel/VBoxContainer/BtnAdmin
@onready var _btn_mod: Button            = $Panel/VBoxContainer/BtnMod
@onready var _btn_place_shop: Button     = $Panel/VBoxContainer/BtnPlaceShop
@onready var _toast_container: VBoxContainer = $ToastContainer
@onready var _banned_overlay: Control    = $BannedOverlay
@onready var _banned_label: Label        = $BannedOverlay/BannedLabel

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

func _ready() -> void:
	# Connect EventBus signals.
	EventBus.init_state_received.connect(_on_init_state_received)
	EventBus.wallet_connected.connect(_on_wallet_connected)
	EventBus.wallet_disconnected.connect(_on_wallet_disconnected)
	EventBus.balance_updated.connect(_on_balance_updated)
	EventBus.transaction_result.connect(_on_transaction_result)
	EventBus.trade_proposals_updated.connect(_on_trade_proposals_updated)
	EventBus.player_banned.connect(_on_player_banned)
	EventBus.placement_mode_toggled.connect(_on_placement_mode_toggled)

	# Connect button presses.
	_btn_trade.pressed.connect(_on_btn_trade_pressed)
	_btn_inventory.pressed.connect(_on_btn_inventory_pressed)
	_btn_admin.pressed.connect(_on_btn_admin_pressed)
	_btn_mod.pressed.connect(_on_btn_mod_pressed)
	_btn_place_shop.pressed.connect(_on_btn_place_shop_pressed)

	# Initial UI state (wallet not yet connected).
	_set_disconnected_ui()
	_banned_overlay.visible = false

# ---------------------------------------------------------------------------
# EventBus handlers
# ---------------------------------------------------------------------------

func _on_init_state_received(_payload: Dictionary) -> void:
	# GameManager already applied the state — just refresh the display.
	_refresh_all()

func _on_wallet_connected(_payload: Dictionary) -> void:
	_refresh_all()

func _on_wallet_disconnected() -> void:
	_set_disconnected_ui()

func _on_balance_updated(balance: int) -> void:
	_balance_label.text = "%d TRIBE" % balance

func _on_transaction_result(result: Dictionary) -> void:
	var success: bool = bool(result.get("success", false))
	var action: String = str(result.get("action", ""))
	var message: String = str(result.get("message", ""))
	var color: Color

	if SYSTEM_ACTIONS.has(action):
		color = COLOR_TOAST_SYSTEM
	elif success:
		color = COLOR_TOAST_SUCCESS
	else:
		color = COLOR_TOAST_FAILURE

	_show_toast(message, color)

func _on_trade_proposals_updated(proposals: Array) -> void:
	var count: int = proposals.size()
	if count > 0:
		_btn_trade.text = "Trade (%d)" % count
	else:
		_btn_trade.text = "Trade"

func _on_player_banned(payload: Dictionary) -> void:
	_banned_overlay.visible = true
	var expiry: int = int(payload.get("expiryMs", 0))
	var msg: String = str(payload.get("message", "You have been banned."))
	if expiry == 0:
		_banned_label.text = "%s\n(Permanent)" % msg
	else:
		# Show the expiry date as a human-readable UTC string.
		# We only have the ms timestamp — format as ISO date via a calculation.
		var expiry_sec: int = expiry / 1000
		_banned_label.text = "%s\nExpires: %s" % [msg, Time.get_datetime_string_from_unix_time(expiry_sec)]

	# Disable interaction buttons.
	_set_buttons_interactable(false)

func _on_placement_mode_toggled(active: bool) -> void:
	_btn_place_shop.text = "Cancel Placement" if active else "Place Shop"

# ---------------------------------------------------------------------------
# Button handlers
# ---------------------------------------------------------------------------

func _on_btn_trade_pressed() -> void:
	Bridge.notify_open_panel("trade")

func _on_btn_inventory_pressed() -> void:
	Bridge.notify_open_inventory()

func _on_btn_admin_pressed() -> void:
	Bridge.notify_open_panel("admin")

func _on_btn_mod_pressed() -> void:
	Bridge.notify_open_panel("moderator")

func _on_btn_place_shop_pressed() -> void:
	# ShopManager owns placement mode — find it and delegate.
	var manager: Node = get_tree().get_first_node_in_group("shop_manager")
	if manager == null:
		push_warning("[HUD] No node in group 'shop_manager' found.")
		return
	manager.toggle_placement_mode()

# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

func _refresh_all() -> void:
	_balance_label.text = "%d TRIBE" % GameManager.balance

	if GameManager.wallet_connected:
		_address_label.text = _truncate_address(GameManager.wallet_address)
		_role_badge.text = _role_text()
	else:
		_set_disconnected_ui()
		return

	_btn_admin.visible = GameManager.is_ssu_owner or GameManager.is_ssu_super_admin or GameManager.is_ssu_admin
	_btn_mod.visible = GameManager.is_ssu_owner or GameManager.is_ssu_super_admin or GameManager.is_ssu_admin or GameManager.is_ssu_mod
	_set_buttons_interactable(not GameManager.is_banned)

func _set_disconnected_ui() -> void:
	_balance_label.text = "-- TRIBE"
	_address_label.text = "Not connected"
	_role_badge.text = ""
	_btn_admin.visible = false
	_btn_mod.visible = false
	_set_buttons_interactable(false)

func _set_buttons_interactable(enabled: bool) -> void:
	_btn_trade.disabled = not enabled
	_btn_inventory.disabled = not enabled
	_btn_admin.disabled = not enabled
	_btn_mod.disabled = not enabled
	_btn_place_shop.disabled = not enabled

func _role_text() -> String:
	if GameManager.is_ssu_owner: return "Owner"
	if GameManager.is_ssu_super_admin or GameManager.is_ssu_admin: return "Admin"
	if GameManager.is_ssu_mod:   return "Mod"
	if GameManager.is_tribe_member: return GameManager.market_role
	return ""

func _truncate_address(address: String) -> String:
	if address.length() <= 12:
		return address
	return "%s...%s" % [address.left(6), address.right(4)]

# ---------------------------------------------------------------------------
# Toast system
# ---------------------------------------------------------------------------

func _show_toast(message: String, color: Color) -> void:
	var lbl: Label = Label.new()
	lbl.text = message
	lbl.add_theme_color_override("font_color", color)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast_container.add_child(lbl)

	# Auto-remove after duration.
	get_tree().create_timer(TOAST_DURATION).timeout.connect(
		func() -> void:
			if is_instance_valid(lbl):
				lbl.queue_free()
	)
