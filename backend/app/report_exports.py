from __future__ import annotations

from datetime import UTC, date, datetime
from io import BytesIO
import re
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from .models import Currency, JournalEntry, Order, User, Wallet


ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")

C = {
    "darkBg": "1E3A5F",
    "midBg": "2D5F8F",
    "accent": "4A90D9",
    "lightBg": "EBF3FB",
    "white": "FFFFFF",
    "black": "1A1A2E",
    "green": "1A7A3C",
    "red": "B71C1C",
    "gray": "6B7280",
    "border": "BDD7EE",
}


def argb(hex_color: str) -> str:
    return f"FF{hex_color}"


def fmt_report_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    local = value.astimezone(ISTANBUL_TZ)
    return local.strftime("%d-%m-%Y %H:%M")


def fmt_money(value: object, decimals: int = 2) -> str:
    return f"{float(value):,.{decimals}f}"


def solid_fill(hex_color: str) -> PatternFill:
    return PatternFill(fill_type="solid", fgColor=argb(hex_color))


def all_borders(color: str = C["border"]) -> Border:
    side = Side(style="thin", color=argb(color))
    return Border(top=side, bottom=side, left=side, right=side)


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "_", value)


def date_key(value: datetime) -> str:
    return value.date().isoformat()


def build_client_statement_xlsx(
    *,
    user: User,
    wallets: list[Wallet],
    currencies: list[Currency],
    orders: list[Order],
    journals: list[JournalEntry],
    user_wallet_ids: set[int],
    from_date: date,
    to_date: date,
) -> tuple[bytes, str]:
    curr_map = {currency.ticker: currency for currency in currencies}
    full_name = f"{user.name}{' ' + user.surname if user.surname else ''}"
    period_label = f"{from_date.strftime('%d/%m/%Y')} — {to_date.strftime('%d/%m/%Y')}"
    generated_at = fmt_report_datetime(datetime.now(UTC))

    tx_rows: list[dict[str, object]] = []
    for order in orders:
        in_curr = curr_map.get(order.currency_in_id)
        out_curr = curr_map.get(order.currency_out_id)
        tx_rows.append(
            {
                "date": order.created_at,
                "dateLabel": fmt_report_datetime(order.created_at),
                "category": "FX Order",
                "type": order.order_type.value,
                "description": (
                    f"{in_curr.name if in_curr else order.currency_in_id} → "
                    f"{out_curr.name if out_curr else order.currency_out_id} "
                    f"@ {float(order.exchange_rate):.4f}"
                ),
                "sent": f"{fmt_money(order.amount_in)} {order.currency_in_id}",
                "received": f"{fmt_money(order.amount_out)} {order.currency_out_id}",
                "note": order.description or "",
                "status": "Voided" if order.voided_at else "Active",
                "voided": bool(order.voided_at),
            }
        )

    for entry in journals:
        is_out = entry.from_wallet_id in user_wallet_ids
        currency = curr_map.get(entry.currency_id)
        tx_rows.append(
            {
                "date": entry.created_at,
                "dateLabel": fmt_report_datetime(entry.created_at),
                "category": "Transfer",
                "type": "Sent" if is_out else "Received",
                "description": f"{currency.name if currency else entry.currency_id} transfer",
                "sent": f"{fmt_money(entry.amount)} {entry.currency_id}" if is_out else "",
                "received": "" if is_out else f"{fmt_money(entry.amount)} {entry.currency_id}",
                "note": entry.description or "",
                "status": "Voided" if entry.voided_at else "Active",
                "voided": bool(entry.voided_at),
            }
        )

    tx_rows.sort(key=lambda item: item["date"])

    wb = Workbook()
    wb.creator = "FX Ledger"
    wb.created = datetime.now()
    ws = wb.active
    ws.title = "Client Statement"
    ws.sheet_view.showGridLines = False
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1

    widths = [2, 20, 12, 10, 28, 22, 22, 32, 10, 2]
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[chr(64 + index)].width = width

    def style(
        cell_ref: str,
        *,
        bold: bool = False,
        size: int = 10,
        color: str = C["black"],
        fill: str | None = None,
        border: Border | None = None,
        horizontal: str = "left",
        vertical: str = "middle",
        wrap_text: bool = False,
        number_format: str | None = None,
    ) -> None:
        cell = ws[cell_ref]
        cell.font = Font(name="Calibri", bold=bold, size=size, color=argb(color))
        if fill:
            cell.fill = solid_fill(fill)
        if border:
            cell.border = border
        cell.alignment = Alignment(
            horizontal=horizontal,
            vertical="center" if vertical == "middle" else vertical,
            wrap_text=wrap_text,
        )
        if number_format:
            cell.number_format = number_format

    row = 1

    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
    ws[f"B{row}"] = "CLIENT STATEMENT"
    style(f"B{row}", bold=True, size=18, color=C["white"], fill=C["darkBg"], horizontal="center")
    ws.row_dimensions[row].height = 38
    row += 1

    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
    ws[f"B{row}"] = full_name
    style(f"B{row}", bold=True, size=13, color=C["white"], fill=C["darkBg"], horizontal="center")
    ws.row_dimensions[row].height = 24
    row += 1

    ws.row_dimensions[row].height = 6
    row += 1

    for label, value in [("Report Period", period_label), ("Generated", generated_at)]:
        ws[f"B{row}"] = label
        style(f"B{row}", bold=True, size=10, color=C["gray"])
        ws.merge_cells(start_row=row, start_column=3, end_row=row, end_column=9)
        ws[f"C{row}"] = value
        style(f"C{row}", size=10, color=C["black"])
        ws.row_dimensions[row].height = 18
        row += 1

    row += 1

    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
    ws[f"B{row}"] = "WALLET BALANCES"
    style(
        f"B{row}",
        bold=True,
        size=11,
        color=C["white"],
        fill=C["midBg"],
        border=all_borders(C["midBg"]),
    )
    ws.row_dimensions[row].height = 22
    row += 1

    for col, label, align in [("B", "Currency", "left"), ("C", "Balance", "right")]:
        ws[f"{col}{row}"] = label
        style(
            f"{col}{row}",
            bold=True,
            size=10,
            color=C["white"],
            fill=C["accent"],
            border=all_borders(),
            horizontal=align,
        )
    ws.row_dimensions[row].height = 18
    row += 1

    if not wallets:
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        ws[f"B{row}"] = "No wallets"
        style(f"B{row}", size=10, color=C["gray"])
        row += 1
    else:
        for index, wallet in enumerate(wallets):
            fill = C["lightBg"] if index % 2 == 1 else C["white"]
            currency = curr_map.get(wallet.currency_id)
            ws[f"B{row}"] = currency.name if currency else wallet.currency_id
            ws[f"C{row}"] = float(wallet.balance)
            style(f"B{row}", size=10, fill=fill, border=all_borders())
            style(
                f"C{row}",
                size=10,
                fill=fill,
                border=all_borders(),
                horizontal="right",
                number_format="#,##0.00",
            )
            ws.row_dimensions[row].height = 18
            row += 1

    row += 1

    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
    ws[f"B{row}"] = f"TRANSACTION HISTORY  ({len(tx_rows)} transactions)"
    style(
        f"B{row}",
        bold=True,
        size=11,
        color=C["white"],
        fill=C["midBg"],
        border=all_borders(C["midBg"]),
    )
    ws.row_dimensions[row].height = 22
    row += 1

    tx_headers = [
        ("B", "Date & Time", "left"),
        ("C", "Category", "center"),
        ("D", "Type", "center"),
        ("E", "Description", "left"),
        ("F", "Sent (Debit)", "right"),
        ("G", "Received (Credit)", "right"),
        ("H", "Note", "left"),
        ("I", "Status", "center"),
    ]
    for col, label, align in tx_headers:
        ws[f"{col}{row}"] = label
        style(
            f"{col}{row}",
            bold=True,
            size=10,
            color=C["white"],
            fill=C["darkBg"],
            border=all_borders(C["darkBg"]),
            horizontal=align,
        )
    ws.row_dimensions[row].height = 20
    row += 1

    if not tx_rows:
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
        ws[f"B{row}"] = "No transactions in this period"
        style(f"B{row}", size=10, color=C["gray"], horizontal="center")
        ws.row_dimensions[row].height = 20
        row += 1
    else:
        for index, tx in enumerate(tx_rows):
            fill = "FFF3F3" if tx["voided"] else C["lightBg"] if index % 2 == 1 else C["white"]
            values = {
                "B": tx["dateLabel"],
                "C": tx["category"],
                "D": tx["type"],
                "E": tx["description"],
                "F": tx["sent"],
                "G": tx["received"],
                "H": tx["note"],
                "I": tx["status"],
            }
            for col, value in values.items():
                ws[f"{col}{row}"] = value
                is_right = col in {"F", "G"}
                is_center = col in {"C", "D", "I"}
                is_voided_status = col == "I" and bool(tx["voided"])
                text_color = C["black"]
                if is_voided_status:
                    text_color = C["red"]
                elif tx["voided"]:
                    text_color = C["gray"]
                elif col == "F" and tx["sent"]:
                    text_color = C["red"]
                elif col == "G" and tx["received"]:
                    text_color = C["green"]

                style(
                    f"{col}{row}",
                    bold=col in {"F", "G"},
                    size=9,
                    color=text_color,
                    fill=fill,
                    border=all_borders(),
                    horizontal="right" if is_right else "center" if is_center else "left",
                    wrap_text=col == "H",
                )
            ws.row_dimensions[row].height = 18
            row += 1

    row += 1
    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=9)
    ws[f"B{row}"] = (
        f"This statement was generated on {generated_at} and reflects all transactions "
        "recorded in the system for the selected period."
    )
    style(f"B{row}", size=8, color=C["gray"], horizontal="center", wrap_text=True)
    ws.row_dimensions[row].height = 28

    output = BytesIO()
    wb.save(output)
    filename = f"{safe_filename(full_name)}_statement_{from_date.isoformat()}_to_{to_date.isoformat()}.xlsx"
    return output.getvalue(), filename
