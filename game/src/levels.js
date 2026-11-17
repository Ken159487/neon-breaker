// The five levels: each one is a brick map drawn as rows of characters over
// ten columns. '1', '2' and '3' are bricks that take that many hits; 'X' is
// a steel brick that never breaks and does not count toward clearing the
// level; '.' is empty. A level is cleared when every breakable brick is gone.

export const LEVELS = [
  {
    name: 'FIRST LIGHT',
    ballSpeed: 1.0,
    rows: [
      '1111111111',
      '1111111111',
      '2222222222',
      '1111111111',
    ],
  },
  {
    name: 'DOUBLE TROUBLE',
    ballSpeed: 1.06,
    rows: [
      '1222222221',
      '2111111112',
      '2222222222',
      '1111111111',
      '1222222221',
    ],
  },
  {
    name: 'THE VAULT',
    ballSpeed: 1.12,
    rows: [
      '1111111111',
      '12XXXXXX21',
      '1222222221',
      '2111111112',
      '1111111111',
    ],
  },
  {
    name: 'CROSSFIRE',
    ballSpeed: 1.18,
    rows: [
      '2111111112',
      '1222222221',
      '111X11X111',
      '2222222222',
      '3333333333',
      '1111111111',
    ],
  },
  {
    name: 'FINAL STORM',
    ballSpeed: 1.25,
    rows: [
      '3333333333',
      '2222222222',
      '11XXXXXX11',
      '2222222222',
      '3333333333',
      '1111111111',
    ],
  },
];

/** The colour of a row, by its index from the top. */
export function rowColor(rowIndex) {
  const colors = ['#ff5d8f', '#ff9f43', '#ffe14d', '#4ade80', '#38bdf8', '#a78bfa'];
  return colors[rowIndex % colors.length];
}
