// DappHub/sources/tickets.move
// User support ticket system. Entirely new module — no BazaarLight equivalent.
// Users submit tickets; DApp owner updates status via DAppOwnerCap.
// Constitution: Article XII.3 — 500-line limit. Current: ~165 lines.
module dapp_hub::tickets {
    use std::string::{Self, String};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use dapp_hub::dapp_governance::DAppOwnerCap;

    // Ticket status constants
    const STATUS_OPEN:        u8 = 0;
    const STATUS_IN_PROGRESS: u8 = 1;
    const STATUS_RESOLVED:    u8 = 2;
    const STATUS_CLOSED:      u8 = 3;

    // Error codes
    const E_TICKET_NOT_FOUND: u64 = 1;
    const E_INVALID_STATUS: u64   = 2;
    const E_EMPTY_TITLE: u64      = 3;
    const E_INVALID_TAG: u64      = 4;
    const E_TITLE_TOO_LONG: u64   = 5;
    const E_BODY_TOO_LONG: u64    = 6;

    // Limits
    const MAX_TITLE_LEN: u64 = 128;
    const MAX_BODY_LEN: u64  = 2048;
    const MAX_TAG: u8        = 5;

    // SupportTicket: stored by value in TicketBoard.tickets table.
    public struct SupportTicket has store {
        id: u64,
        title: String,
        tag: u8,             // 0=Feedback, 1=Bug, 2=Suggestion, 3=Other
        body: String,
        contact_method: u8,  // 0=Ingame, 1=Email
        contact_value: String,
        author: address,
        status: u8,
        created_at: u64,
    }

    // TicketBoard: single shared object holding all support tickets.
    public struct TicketBoard has key {
        id: UID,
        tickets: Table<u64, SupportTicket>,
        next_id: u64,
        open_count: u64,
    }

    // Events
    public struct TicketSubmittedEvent has copy, drop {
        ticket_id: u64,
        author: address,
        tag: u8,
        title: String,
        timestamp_ms: u64,
    }
    public struct TicketStatusChangedEvent has copy, drop {
        ticket_id: u64,
        old_status: u8,
        new_status: u8,
        timestamp_ms: u64,
    }

    fun init(ctx: &mut TxContext) {
        let board = TicketBoard {
            id: object::new(ctx),
            tickets: table::new(ctx),
            next_id: 1,
            open_count: 0,
        };
        transfer::share_object(board);
    }

    // Submit a support ticket. Permissionless — any user may submit.
    // Aborts: E_EMPTY_TITLE (3) if title bytes are empty.
    public fun submit_ticket(
        board: &mut TicketBoard,
        title: vector<u8>,
        tag: u8,
        body: vector<u8>,
        contact_method: u8,
        contact_value: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!vector::is_empty(&title), E_EMPTY_TITLE);
        assert!(vector::length(&title) <= MAX_TITLE_LEN, E_TITLE_TOO_LONG);
        assert!(vector::length(&body) <= MAX_BODY_LEN, E_BODY_TOO_LONG);
        assert!(tag <= MAX_TAG, E_INVALID_TAG);
        let ticket_id = board.next_id;
        let timestamp_ms = clock::timestamp_ms(clock);
        let author = tx_context::sender(ctx);
        let title_str = string::utf8(title);
        let event_title = title_str;
        let ticket = SupportTicket {
            id: ticket_id,
            title: title_str,
            tag,
            body: string::utf8(body),
            contact_method,
            contact_value: string::utf8(contact_value),
            author,
            status: STATUS_OPEN,
            created_at: timestamp_ms,
        };
        table::add(&mut board.tickets, ticket_id, ticket);
        board.next_id = ticket_id + 1;
        board.open_count = board.open_count + 1;
        event::emit(TicketSubmittedEvent {
            ticket_id,
            author,
            tag,
            title: event_title,
            timestamp_ms,
        });
    }

    // Update ticket status. Requires DAppOwnerCap.
    // Aborts: E_INVALID_STATUS (2) if new_status > 3.
    // Aborts: E_TICKET_NOT_FOUND (1) if ticket_id does not exist.
    public fun update_ticket_status(
        _cap: &DAppOwnerCap,
        board: &mut TicketBoard,
        ticket_id: u64,
        new_status: u8,
        clock: &Clock,
    ) {
        assert!(new_status <= STATUS_CLOSED, E_INVALID_STATUS);
        assert!(table::contains(&board.tickets, ticket_id), E_TICKET_NOT_FOUND);
        let ticket = table::borrow_mut(&mut board.tickets, ticket_id);
        let old_status = ticket.status;
        if (old_status == STATUS_OPEN && new_status != STATUS_OPEN && board.open_count > 0) {
            board.open_count = board.open_count - 1;
        };
        ticket.status = new_status;
        event::emit(TicketStatusChangedEvent {
            ticket_id,
            old_status,
            new_status,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // Read a specific ticket by ID.
    // Aborts: E_TICKET_NOT_FOUND (1)
    public fun ticket(board: &TicketBoard, ticket_id: u64): &SupportTicket {
        assert!(table::contains(&board.tickets, ticket_id), E_TICKET_NOT_FOUND);
        table::borrow(&board.tickets, ticket_id)
    }

    // Total ticket count (including resolved and closed).
    public fun ticket_count(board: &TicketBoard): u64 { board.next_id - 1 }

    // Count of currently open tickets.
    public fun open_count(board: &TicketBoard): u64 { board.open_count }

    // SupportTicket field accessors.
    public fun ticket_id(t: &SupportTicket): u64              { t.id }
    public fun ticket_title(t: &SupportTicket): &String       { &t.title }
    public fun ticket_tag(t: &SupportTicket): u8              { t.tag }
    public fun ticket_body(t: &SupportTicket): &String        { &t.body }
    public fun ticket_author(t: &SupportTicket): address      { t.author }
    public fun ticket_status(t: &SupportTicket): u8           { t.status }
    public fun ticket_contact_method(t: &SupportTicket): u8   { t.contact_method }
    public fun ticket_contact_value(t: &SupportTicket): &String { &t.contact_value }
    public fun ticket_created_at(t: &SupportTicket): u64      { t.created_at }
}
// END OF FILE — dapp_hub::tickets
