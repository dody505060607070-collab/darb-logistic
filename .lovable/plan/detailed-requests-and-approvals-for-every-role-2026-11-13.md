# Detailed requests and approvals for every role

Goal: each job gets the same treatment the driver's return trip got. They send a clear, simple request with the real details. The person responsible sees one card with those details and an Approve / Reject button. A rejection always carries a reason, and that reason reaches the sender on WhatsApp and on their own page. Each job also gets its own home page showing only what concerns it, plus a quick chat button.

## Current state (checked)
- Separate home pages exist only for: dispatcher, accountant, maintenance manager, fleet supervisor.
- Field maintenance technician, workshop and representative have no home page of their own.
- Only the driver's return trip has structured details plus approve/reject with a reason.

## Shared pattern (built once, reused everywhere)
- A request card: who sent it, when, what it's about, the details in short lines, then Approve / Reject.
- Rejection opens a reason box. The reason is sent to the sender on WhatsApp and shown on their page.
- An "Awaiting your approval" box at the top of each reviewer's home page, filtered by job.
- A "My requests" section for every sender: pending / approved / rejected, with the reason.
- A chat button on every home page.

## Per role

**Driver / representative**
- Return trip (done): cargo, size, how full, where from.
- Expense or diesel request: amount, type, station or place, receipt photo, odometer reading.
- Breakdown report: type, can the truck still move, location, photo.
- Delay notice: reason, expected arrival time.
- Representative: "My visits/collections today" page with the customer, the amount collected and a note.

**Dispatcher**
- Box: return trip requests and delay notices from drivers.
- Approving a return trip creates the trip right away (done).
- Driver reassignment request when a driver is unavailable, with a reason.

**Fleet supervisor**
- Box: handovers between drivers and failed inspections.
- Approving a custody handover shows the odometer, fuel level and damage noted.

**Accountant**
- Box: expenses, diesel, cash advances and custody wallet top-ups.
- Each card shows the amount, the receipt, the trip and the driver, with a single Approve button.

**Maintenance manager**
- Box: maintenance requests from drivers and technicians, and workshop cost estimates.
- Approving a cost estimate sets the approved budget. A rejection sends the reason to the workshop.

**Field technician (new home page)**
- My assigned jobs, a "start job / finished" button, parts used, and photos before and after.
- A parts or extra-cost request that goes to the maintenance manager for approval.

**Workshop (new home page)**
- Vehicles at my workshop, a cost estimate form (labour, parts, expected date), and a "ready for pickup" button.
- Shows whether each estimate was approved or rejected, with the reason.

## Order of work
1. Shared card, reason box and WhatsApp notice to the sender.
2. Driver requests (expense, breakdown, delay) plus "My requests".
3. Approval boxes for the dispatcher, accountant, fleet supervisor and maintenance manager.
4. New home pages for the field technician, workshop and representative.
5. Test each role with a real account: send a request, approve it, reject it, and confirm the WhatsApp message is queued.

## Technical details
- Review actions are role-checked database operations. Each one records the reviewer, the time and the reason, and queues a WhatsApp message to the sender.
- Existing records (expenses, diesel, advances, work orders, custody, incidents) get only the missing detail and reason fields, added without breaking anything. A new "delay notices" record is added.
- The existing approval steps for expenses, work orders and custody stay the same. Only the screens and messages are added on top of them.
