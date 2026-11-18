// Reference text the assistant answers FAQs from. Edit freely — plain text,
// no code changes needed elsewhere. Anything not covered here, the assistant
// is told to hand off to the sales rep / team instead of guessing.

export const FAQ_KNOWLEDGE = `
## Jewelry care
- Clean gold and platinum jewelry with warm water, a drop of mild dish soap and a soft toothbrush; rinse and pat dry with a lint-free cloth.
- Remove jewelry before swimming (chlorine), cleaning with household chemicals, the gym, gardening or heavy lifting.
- Put jewelry on after lotions, perfume and hairspray.
- Store pieces separately (soft pouch or lined box) so diamonds don't scratch other pieces.
- Have prongs and settings checked by a jeweler about once a year, sooner if a stone feels loose or catches on clothing.
- White gold is usually rhodium plated; the plating wears over time and can be re-applied by a jeweler to restore the bright white color.

## Metals
- 10K gold is about 41.7% pure gold: the most durable and lowest price, slightly paler color.
- 14K gold is about 58.3% pure gold: the most popular balance of durability, color and price.
- 18K gold is 75% pure gold: richer color, softer, higher price.
- Gold colors: yellow, white (usually rhodium plated) and rose (alloyed with copper). The karat is the same across colors.
- Platinum is naturally white, dense and very durable; it develops a soft matte patina over time that can be polished.
- People with nickel sensitivity often do better with platinum, yellow gold or rose gold than with some white gold alloys.

## Sizing
- Ring sizes are given in US sizes (for example 6, 6.5, 7).
- The most reliable way to get a size is a jeweler's ring sizer. Fingers are slightly larger at the end of the day and in warm weather.
- Wider bands fit tighter, so a wide band may need a quarter to half size up.
- Whether a finished ring can be resized depends on the design (eternity bands and some settings cannot be resized easily). For a specific piece, the sales rep confirms.

## Returns, exchanges and resizing policy
- Custom pieces are made to order. For the exact return, exchange, resizing and warranty terms on an order, the customer should contact their sales rep or message the team on the order page.
`;

export const CUSTOMER_GUIDE = `
## Using the dashboard (customer portal)
- My Orders lists every order with its status. Use the status filters at the top to narrow the list.
- New Order (button on My Orders) starts a custom request: Contact Information, Jewelry Details (type, metal, color, size, quantity), Stone Details (diamond type and quality, gemstone) and Reference & Notes, where inspiration photos or videos can be added along with special instructions.
- Opening an order shows the Current Status timeline: Order Received → CAD Design → In Production → Manufactured → Completed.
- While an order is in CAD Design, the stage shows as Pending CAD (the designer is working on it), Awaiting Approval (a design is ready to review), or Revision (changes are being made).
- When a design is Awaiting Your Approval, open the order to view the 3D design, then approve it or describe the changes you want. Each new design version is marked Revised.
- The design file can be downloaded with the Download button on the design viewer.
- Reference Images on the order page let you add more inspiration photos; you can also record a voice note for the team.
- The conversation box on the order page sends a message straight to the team working on the order.
- While a design is awaiting approval and nothing has gone into production, Close Project lets you stop the order.
`;

export const STAFF_GUIDE = `
## Using the dashboard (staff)
- Orders: the main list with a status tab per stage (New, CAD In Progress, VPO Issued, Manufactured, Shipped, Completed and more), search, and filters. A Kanban board view is also available.
- Order detail page: specs, status changes, CAD files and revisions, reference files and reference voice notes, the customer conversation, internal notes, and the activity history.
- Deadline chips beside the PO number (staff only) count down the targets: first CAD within 24 hours of moving to CAD In Progress, stone within 2 days of supplier assignment, manufacturing within 6 days of VPO issued. Amber means the last quarter of the window, red means overdue.
- CAD page: the CAD designer's queue (pending CAD and revisions).
- Manufacturing and Stone pages: production and stone tracking for orders in production.
- Reports, To-dos, Repairs and Customers each have their own page in the sidebar. The search bar at the top finds orders, customers, companies and messages.
`;
