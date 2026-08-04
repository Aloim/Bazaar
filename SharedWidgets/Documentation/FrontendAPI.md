# SharedWidgets -- Frontend API Specification

> **Status:** Phase 2 Complete
> **Constitution Reference:** Article II.1 -- Frontend designed FIRST
> **Last Updated:** Phase 2 (SharedWidgets Frontend Design)

---

## Overview

This document defines what the `@bazaar/widgets` frontend package needs from the SharedWidgets Move contracts. Derived from Phase 2 UI component designs: 5 widget components, 5 hooks, and 8 TX builders in `bazaar-frontend/packages/widgets/`.

SharedWidgets provides social components (announcements, guestbook, mission board, donations) that all three bazaar apps (NoTribe, Easy, Advanced) can embed. The Move package is role-AGNOSTIC -- authority checks happen in the calling bazaar package (bazaar_core), not in shared_widgets itself.

---

## 1. Hooks (RPC Reads)

### Announcement Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useAnnouncements(ssuId: string)` | `Announcement[]` -- all announcements for this SSU's AnnouncementBoard, sorted by sticky then date | AnnouncementBoard |

### Guestbook Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useGuestbook(ssuId: string)` | `GuestbookEntry[]` -- all guestbook entries (max 500) for this SSU's GuestbookBoard | GuestbookPanel |

### Mission Board Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useMissionBoard(ssuId: string)` | `string \| null` -- full text content of the mission board, or null if empty | MissionBoard |

### Donate Config Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useDonateConfig(ssuId: string)` | `{ enabled: boolean }` -- whether the donate widget is enabled at this SSU | DonatePanel |

### Widget Config Hooks
| Hook | Returns | Used By |
|------|---------|---------|
| `useWidgetConfig(ssuId: string)` | `WidgetConfig` -- enabled/disabled state for all 4 widget slots (announcements, guestbook, donate, multiplayer) | Parent app (controls which widgets to render) |

---

## 2. TX Builders (Write Operations)

### Announcement TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildCreateAnnouncement(announcementBoardId, title, body, visibility)` | Board object ID, title string, body string, visibility (0=Public, 1=Member, 2=Admin) | AnnouncementBoard post action, TribeGovernanceButton AnnouncementsTab |
| `buildDeleteAnnouncement(announcementBoardId, annId)` | Board object ID, announcement ID (u64) | AnnouncementBoard admin delete |
| `buildAddComment(announcementBoardId, annId, text)` | Board object ID, announcement ID, comment text | AnnouncementBoard comment action |

### Guestbook TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildAddGuestbookEntry(guestbookBoardId, text)` | Board object ID, message text (max 250 chars) | GuestbookPanel sign form |
| `buildDeleteGuestbookEntry(guestbookBoardId, entryId)` | Board object ID, entry ID (u64) | GuestbookPanel admin/author delete |

### Mission Board TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildSetMissionContent(missionBoardId, content)` | Board object ID, full text content | MissionBoard edit action |

### Donate TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildDonateEve(donateConfigId, amountMist)` | Config object ID, donation amount in MIST (bigint) | DonatePanel donate button |

### Widget Config TX Builders
| TX Builder | Parameters | Used By |
|------------|-----------|---------|
| `buildToggleWidget(widgetConfigId, widgetIdx, enabled)` | Config object ID, widget slot index (0-3), boolean | GovernancePanel (via parent app SSU governance) |

---

## 3. TypeScript Types

All types from `bazaar-frontend/packages/widgets/types/index.ts`:

### Announcement Types
- `Comment` -- Comment on an announcement (author, text, createdAtMs)
- `Announcement` -- Announcement entry (id, author, title, body, visibility, isSticky, createdAtMs, comments)

### Guestbook Types
- `GuestbookEntry` -- Guestbook entry (id, author, message, createdAtMs)

### Widget Config Types
- `WIDGET_INDEX` -- Constant object mapping slot names to indices (ANNOUNCEMENTS=0, GUESTBOOK=1, DONATE=2, MULTIPLAYER=3)
- `WidgetConfig` -- Enabled/disabled state for all 4 widget slots

### Donate Types
- `DonationRecord` -- Donation event record (donor, amountMist, timestampMs)

---

## 4. Component-to-API Matrix

| Component | Hooks Required | TX Builders Required |
|-----------|---------------|---------------------|
| AnnouncementBoard | useAnnouncements | buildCreateAnnouncement (via onPost prop), buildDeleteAnnouncement (admin), buildAddComment |
| GuestbookPanel | useGuestbook | buildAddGuestbookEntry (via onSign prop), buildDeleteGuestbookEntry (admin/author) |
| MissionBoard | useMissionBoard | buildSetMissionContent (via onEdit prop, admin only) |
| DonatePanel | useDonateConfig | buildDonateEve (via onDonate prop) |
| GovernancePanel | useWidgetConfig | buildToggleWidget (via parent app governance) |

---

## 5. Widget Slot Index Reference

| Index | Widget | Move Module | Hook |
|-------|--------|-------------|------|
| 0 | Announcements | `shared_widgets::announcements` | `useAnnouncements` |
| 1 | Guestbook | `shared_widgets::guestbook` | `useGuestbook` |
| 2 | Donate | `shared_widgets::donate` | `useDonateConfig` |
| 3 | Multiplayer | (reserved) | -- |

---

## 6. Integration Notes

### Role-Agnostic Design
SharedWidgets Move modules do NOT check roles. The calling package (bazaar_core) validates that the caller has the required SSU or tribe role before invoking shared_widgets functions. This means:
- `buildToggleWidget` goes through `bazaar_core::widget_ops::toggle_widget` which validates SSU admin capability
- `buildCreateAnnouncement` may go through bazaar_core for role-gated announcements (visibility > 0)
- `buildAddGuestbookEntry` and `buildDonateEve` are permissionless (no role check needed)

### Per-SSU Data Isolation
All widget objects (AnnouncementBoard, GuestbookBoard, MissionBoard, WidgetConfig) are created per-SSU. The `ssuId` parameter on all hooks ensures data is isolated between SSUs even within the same tribe.

### Stale Time Configuration
- Announcements: 30 seconds (frequently updated)
- Guestbook: 30 seconds (frequently updated)
- Mission Board: 60 seconds (rarely changes)
- Widget Config: 60 seconds (rarely changes)
- Donate Config: 60 seconds (rarely changes)
