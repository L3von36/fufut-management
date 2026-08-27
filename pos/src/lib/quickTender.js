/**
 * Quick-tender amounts for a cash payment.
 *
 * The buttons exist so a waiter can settle cash without typing. To do that they
 * have to describe what a guest actually hands over: a round figure at or just
 * above the bill — 710, 750, 800 on a 704 bill — never a note the bill already
 * exceeds. The previous version padded short lists with 10 and 50 ETB, which on
 * that same 704 bill rendered as "ETB 500 · ETB 1000 · ETB 10 · ETB 50": an
 * insufficient note first, two useless ones after, in no order. A quick-tender
 * row where most buttons don't cover the bill is slower than the number pad.
 *
 * Exact tender is a separate button on the same panel, so amounts equal to the
 * bill are omitted here; every button is strictly more than the bill.
 */

const NOTES = [10, 50, 100, 200, 500, 1000];

export function quickTenderAmounts(grandTotal) {
  const total = Math.ceil(Number(grandTotal) || 0);
  if (!(total > 0)) return [];

  const roundUpTo = (n, step) => Math.ceil(n / step) * step;
  const candidates = [
    roundUpTo(total, 10),
    roundUpTo(total, 50),
    roundUpTo(total, 100),
    ...NOTES.filter((n) => n > total),
  ];

  let amounts = [...new Set(candidates)].filter((a) => a > total).sort((a, b) => a - b);

  if (!amounts.length) {
    // A bill at or above the largest note — 1000 exactly, or a 2400 party —
    // leaves no note to offer: the notes themselves are the exact amount. What
    // a guest hands over then is the bill plus one more note, so offer that.
    amounts = [total + 50, total + 100, total + 200, total + 500];
  }

  return amounts.slice(0, 4);
}
