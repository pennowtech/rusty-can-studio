## Data Table Features

**Display filtering:**

- The display filter sits above the CAN Monitor table.
- It supports bare text search and field conditions such as `canId == 18203C01`, `len >= 8`, or `errorText contains POSITION`.
- Right click a column header to build a filter from that column.
- The clear button inside the filter field removes the current expression quickly.

**Sorting:**

- Right click a column header to sort ascending or descending.
- Use "Add as next ascending sort" or "Add as next descending sort" for multi-column priority.
- Active sort rules are shown in the sort strip above the trace summary.
- Use the rule chip controls to move priority up or down, toggle direction, or remove a rule.
- Sort presets can be saved, loaded, and deleted from the sort strip.

**Pagination for loaded logs:**

- Pagination appears only for loaded candump/log files.
- Live capture remains stream-oriented and auto-follows the newest frames.
- The footer provides First, Previous, Next, Last, current page, total pages, and row count options.
- Pagination works after filtering and sorting.
- Page size and current page are remembered in monitor preferences.

**Column chooser:**

- Use the Columns button in the monitor header.
- Default trace columns, CAN ID fields, and payload header fields can be shown or hidden.
- Column visibility is remembered across app restarts.

**Column reordering:**

- Drag a header and drop it onto another header to reorder columns.
- Column order is remembered in monitor preferences.

**Context menus:**

- Right click a cell to copy the value, copy the CAN message, copy a candump line, or stage the frame for transmit.
- Right click a row to work with the complete message.
- Right click a header to filter or sort by that column.

**Keyboard navigation:**

- Arrow Up and Arrow Down move the selected row.
- Page Up and Page Down move by a larger step.
- Home and End jump to the first or last visible row.
- Enter toggles the decoded preview panel.

**Virtualization and responsiveness:**

- Only visible rows are rendered.
- Filtering is deferred while typing.
- Derived row data, columns, and trace statistics are memoized.
- Loaded logs can be paginated for large offline traces.
