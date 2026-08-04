# SharedWidgets — Infrastructure Plan
## Reusable Social & UI Modules

> **Purpose:** Shared widget modules used by ALL bazaar types.
> Announcements, guestbook, mission board, widget config, and donate functionality.
> Extracted to avoid duplicating social features across NoTribe/Easy/Advanced packages.

---

## 1. Package Identity

| Field | Value |
|-------|-------|
| Package Name | `shared_widgets` |
| Language | Sui Move + React/TypeScript components |
| Max Size Target | 25KB bytecode (Move) |
| Move Dependencies | `sui` (standalone — no Bazaar package dependencies) |
| Frontend | `@bazaar/widgets` npm workspace package (imported by all bazaar apps) |

---

## 2. Move Modules

### 2.1 `widget_config.move` (~140 lines)
**Migrated from:** `widget_config.move`

Per-SSU widget toggle configuration:

```move
struct WidgetConfig has key, store {
    id: UID,
    ssu_id: address,
    widgets_enabled: vector<bool>,  // [announcements, guestbook, donate, mission_board, ...]
    server_url: String,
}
```

**Entry Functions:**
```move
public fun create_widget_config(ssu_id: address, ctx: &mut TxContext): WidgetConfig
public fun toggle_widget(config: &mut WidgetConfig, widget_idx: u64, enabled: bool)
public fun is_widget_enabled(config: &WidgetConfig, widget_idx: u64): bool
public fun set_server_url(config: &mut WidgetConfig, url: String)
```

**Access Control:** Widget config is stored as a dynamic field on the SSU governance object in the respective bazaar package. The bazaar package validates the caller's role before calling widget functions.

### 2.2 `announcements.move` (~400 lines)
**Migrated from:** `announcements.move`

```move
struct AnnouncementBoard has key, store {
    id: UID,
    ssu_id: address,
    announcements: vector<Announcement>,
    max_announcements: u64,
}

struct Announcement has store, drop {
    id: u64,
    author: address,
    title: String,
    body: String,
    visibility: u8,
    is_sticky: bool,
    created_at_ms: u64,
    comments: vector<Comment>,
}
```

**Entry Functions:**
```move
public fun create_board(ssu_id: address, ctx: &mut TxContext): AnnouncementBoard
public fun create_announcement(board: &mut AnnouncementBoard, title: String, body: String, visibility: u8, author: address, clock: &Clock)
public fun edit_announcement(board: &mut AnnouncementBoard, ann_id: u64, title: String, body: String, caller: address)
public fun delete_announcement(board: &mut AnnouncementBoard, ann_id: u64, caller: address)
public fun set_sticky(board: &mut AnnouncementBoard, ann_id: u64, sticky: bool)
public fun add_comment(board: &mut AnnouncementBoard, ann_id: u64, text: String, author: address, clock: &Clock)
public fun delete_comment(board: &mut AnnouncementBoard, ann_id: u64, comment_idx: u64, caller: address)
```

**Access Control Pattern:** The calling bazaar package validates the caller's role (Mod+, Admin+, etc.) before invoking these functions. The widget module itself does NOT check roles — it trusts the calling package.

### 2.3 `guestbook.move` (~150 lines)
**Migrated from:** `guestbook.move`

```move
struct GuestbookBoard has key, store {
    id: UID,
    ssu_id: address,
    entries: vector<GuestbookEntry>,
    max_entries: u64,  // 500 cap
}

struct GuestbookEntry has store, copy, drop {
    id: u64,
    author: address,
    message: String,
    created_at_ms: u64,
}
```

### 2.4 `mission_board.move` (~90 lines)
**Migrated from:** `mission_board.move`

```move
struct MissionBoard has key, store {
    id: UID,
    ssu_id: address,
    title: String,
    body: String,
}
```

### 2.5 `donate.move` (~150 lines)
**NEW — extracted from tribe_vault donate logic**

Permissionless donation to tribe/SSU:

```move
struct DonateConfig has key, store {
    id: UID,
    ssu_id: address,
    is_enabled: bool,
    total_donated_eve: u64,
    donation_count: u64,
}

public fun donate_eve(config: &mut DonateConfig, payment: Coin<SUI>, clock: &Clock, ctx: &TxContext)
```

---

## 3. Frontend — `@bazaar/widgets` Package

### 3.1 React Components (shared across all bazaar apps)

```
@bazaar/widgets/
├── components/
│   ├── AnnouncementBoard.tsx      — Full announcement list + CRUD
│   ├── AnnouncementBeacon.tsx     — Godot beacon for announcements
│   ├── AnnouncementDetail.tsx     — Single announcement view + comments
│   ├── GuestbookPanel.tsx         — Guestbook entries + write
│   ├── GuestbookBeacon.tsx        — Godot beacon
│   ├── MissionBoardPanel.tsx      — Mission board display
│   ├── MissionBoardBeacon.tsx     — Godot beacon
│   ├── DonatePanel.tsx            — Donate interface
│   ├── DonateBeacon.tsx           — Godot beacon
│   ├── WidgetMenuTab.tsx          — Admin toggle panel
│   └── ExchangeBeacon.tsx         — Exchange beacon (Advanced only)
├── hooks/
│   ├── useAnnouncements.ts        — Direct RPC for announcement boards
│   ├── useGuestbook.ts            — Direct RPC for guestbook
│   ├── useMissionBoard.ts         — Direct RPC for mission board
│   ├── useWidgetConfig.ts         — Direct RPC for widget toggles
│   └── useDonate.ts               — Direct RPC for donate config
├── tx/
│   ├── announcements.ts           — TX builders for announcements
│   ├── guestbook.ts               — TX builders for guestbook
│   ├── mission_board.ts           — TX builders for mission board
│   ├── widgets.ts                 — TX builders for widget config
│   └── donate.ts                  — TX builders for donate
└── index.ts                       — Public exports
```

### 3.2 Integration Pattern

Each bazaar app imports from `@bazaar/widgets`:

```typescript
import { AnnouncementBoard, GuestbookPanel, WidgetMenuTab } from '@bazaar/widgets';
import { useAnnouncements, useGuestbook } from '@bazaar/widgets/hooks';
```

The bazaar app provides the SSU ID, role context, and package IDs. The widget components are role-agnostic — the parent app handles authorization UI.

---

## 4. Size Budget (Move)

| Module | Estimated Bytecode |
|--------|-------------------|
| widget_config.move | ~3 KB |
| announcements.move | ~8 KB |
| guestbook.move | ~3 KB |
| mission_board.move | ~2 KB |
| donate.move | ~3 KB |
| **Total** | **~19 KB** |

Well within the 25KB target.

---

## 5. Access Control Architecture

**Important Design Decision:** SharedWidgets is completely role-agnostic and governance-unaware. It depends on `sui` only — no DappHub, no bazaar package dependencies.

**Why:** Role checks are context-dependent across bazaar types:
- NoTribe: SSU Owner/SuperAdmin/Admin/Mod can write announcements
- Easy/Advanced SSU-local: SSU Owner/Admin/Mod (SSU-level caps)
- Easy/Advanced Tribe-global: TribeLeader/Global SuperAdmin/Admin/Mod (tribe-level caps)

These capabilities are defined in different packages (DappHub for tribe caps, each bazaar package for SSU caps). Widgets cannot depend on all of them without circular dependencies.

**How it works:**
1. The bazaar package validates the caller's authority (checks caps at the right governance level)
2. Only after validation, the bazaar package calls the widget function (e.g., `shared_widgets::announcements::create_announcement(...)`)
3. The widget function stores the data — it trusts the caller already validated
4. Widget objects (`AnnouncementBoard`, `GuestbookBoard`, etc.) are per-SSU or per-tribe, ensuring complete data isolation between tribes

**Data Isolation:**
```
Tribe A - SSU #1 → AnnouncementBoard (object 0xaaa...) — only Tribe A sees this
Tribe A - SSU #2 → AnnouncementBoard (object 0xbbb...) — only Tribe A sees this
Tribe B - SSU #1 → AnnouncementBoard (object 0xccc...) — only Tribe B sees this
Tribe A Global   → AnnouncementBoard (object 0xddd...) — tribe-wide, all Tribe A SSUs
```

Each bazaar package controls which board object gets passed to the widget function. A Tribe B user has no access to Tribe A's board objects.

---

## 6. Reference Sources (NO COPY-PASTE)

The following serve as **mental reference only**. All code typed from scratch.

| Existing Source (READ ONLY) | What to Study | Notes |
|-----------------------------|--------------|-------|
| `Bazar1/widget_config.move` | Widget toggle pattern | Study then rewrite (strip role checks — caller handles auth) |
| `Bazar1/announcements.move` | Announcement board pattern | Study then rewrite (strip role checks) |
| `Bazar1/guestbook.move` | Guestbook pattern | Study then rewrite (strip role checks) |
| `Bazar1/mission_board.move` | Mission board pattern | Study then rewrite (strip role checks) |
| `Bazar1/DonatePanel.tsx` | Donate UI pattern | Study then rewrite |
| `Bazar1/AnnouncementBoard components` | Widget UI patterns | Study then rewrite for `@bazaar/widgets` package |

---

## 7. Init Function

```move
fun init(ctx: &mut TxContext) {
    // SharedWidgets has NO shared objects at init.
    // All widget objects are created per-SSU when the bazaar package registers them.
    // This is intentional — widgets are children of SSU governance objects.
}
```

---

## 8. Documentation Deliverables

All stored in `SharedWidgets/Documentation/`:

| Document | Written When | Contents |
|----------|-------------|----------|
| `FrontendAPI.md` | **Phase 2D (FIRST)** | Every hook, TX builder, type for `@bazaar/widgets` components |
| `InternalAPI.md` | Phase 5 (after Move code) | All internal functions, structs, events |
| `InterfaceSpec.md` | Phase 5 (after Move code) | How SharedWidgets exposes its functionality |

---

## 9. Build Order (Frontend-First)

1. **Phase 2D:** Design all widget components (announcement, guestbook, mission board, donate, widget menu) → write `FrontendAPI.md`
2. **Phase 5:** Write Move contracts that satisfy the Frontend API → write `InternalAPI.md` + `InterfaceSpec.md`
3. **Phase 5:** Write TX builders + hooks → wire into `@bazaar/widgets` components
4. Deploy + test

---

## 10. Technical Feasibility Note

**Is a separate widgets package worth it?**

**YES, because:**
- Saves ~19KB duplication across 3 bazaar packages (57KB total savings)
- Single upgrade path for social features
- Consistent behavior across all bazaar types

**Potential issue:**
- Cross-package dynamic field storage requires careful type management
- If SharedWidgets types change, all bazaar packages need recompilation
- Solution: Use `additive` upgrade policy, never modify existing struct layouts
