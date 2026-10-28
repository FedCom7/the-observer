import { useId } from 'react';

// A cycling jersey drawn from the colour word Wikipedia uses for it ("pink", "polkadot",
// "blue polkadot", "red number"…), the rainbow and European jerseys, or a nation's colours.

const SHIRT = 'M11 3 L6 5 L1 11 L5 15.5 L8 12.5 L8 29 L24 29 L24 12.5 L27 15.5 L31 11 L26 5 L21 3 Q16 7.5 11 3 Z';

const PLAIN: [RegExp, string][] = [
  [/pink|rosa/, '#f49ac1'], [/yellow|gold/, '#ffd200'], [/dark green/, '#0c8a3c'], [/light green|lime/, '#7cc242'], [/green/, '#14a04a'],
  [/violet|purple|cyclamen|ciclamino/, '#a83b8f'], [/orange/, '#f28a1d'], [/turquoise|azul|light ?blue|sky ?blue/, '#29a7de'], [/blue/, '#1f5fbf'],
  [/red/, '#d7262e'], [/black/, '#1d1d1f'], [/white/, '#ffffff'], [/grey|gray|silver/, '#b9bec6'],
];
const plainOf = (c: string) => PLAIN.find(([re]) => re.test(c))?.[1];

/** Flag-style jerseys of the national champions: bands, crosses and plain fields. */
const FLAG: Record<string, [kind: 'v' | 'h' | 'cross' | 'plain', ...colors: string[]]> = {
  ITA: ['v', '#009246', '#ffffff', '#ce2b37'], FRA: ['v', '#0055a4', '#ffffff', '#ef4135'], BEL: ['v', '#1d1d1f', '#fdda24', '#ef3340'], IRL: ['v', '#169b62', '#ffffff', '#ff883e'],
  MEX: ['v', '#006847', '#ffffff', '#ce1126'], CAN: ['v', '#d80621', '#ffffff', '#d80621'], POR: ['v', '#006600', '#ff0000', '#ff0000'],
  NED: ['h', '#ae1c28', '#ffffff', '#21468b'], GER: ['h', '#1d1d1f', '#dd0000', '#ffce00'], SLO: ['h', '#ffffff', '#0057b8', '#ed1c24'], AUT: ['h', '#ed2939', '#ffffff', '#ed2939'],
  LUX: ['h', '#ed2939', '#ffffff', '#00a1de'], COL: ['h', '#fcd116', '#003893', '#ce1126'], ECU: ['h', '#ffdd00', '#034ea2', '#ed1c24'], ESP: ['h', '#aa151b', '#f1bf00', '#aa151b'],
  GBR: ['h', '#012169', '#ffffff', '#c8102e'], USA: ['h', '#b22234', '#ffffff', '#3c3b6e'], AUS: ['h', '#00008b', '#ffffff', '#00008b'], POL: ['h', '#ffffff', '#dc143c', '#dc143c'],
  NZL: ['h', '#1d1d1f', '#1d1d1f', '#ffffff'], RSA: ['h', '#007749', '#ffb81c', '#de3831'], ERI: ['h', '#12ad2b', '#ea0437', '#4189dd'], CZE: ['h', '#ffffff', '#d7141a', '#11457e'],
  DEN: ['cross', '#c8102e', '#ffffff'], NOR: ['cross', '#ba0c2f', '#ffffff'], SWE: ['cross', '#006aa7', '#fecc00'], FIN: ['cross', '#ffffff', '#002f6c'], SUI: ['plain', '#da291c', '#ffffff'],
};

const RAINBOW = ['#0075c9', '#e4002b', '#1d1d1f', '#ffd100', '#009a44'];

export function Jersey({ color, nat, size = 22, title }: { color?: string | null; nat?: string | null; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const c = (color ?? '').toLowerCase();
  const clip = `j${id}c`;
  const flag = nat ? FLAG[nat] : undefined;
  let body: React.ReactNode;
  let base = plainOf(c.replace(/\b(polka ?dots?|polkadot|dots?|number)\b/g, '').trim()) ?? '#ffffff';

  if (c === 'rainbow' || c === 'world') {
    base = '#ffffff';
    body = RAINBOW.map((col, i) => <rect key={col} x={0} y={12.4 + i * 1.3} width={32} height={1.3} fill={col} />);
  } else if (c === 'european') {
    base = '#003399';
    body = <><rect x={0} y={13} width={32} height={4} fill="#ffffff" />{[9, 13, 16, 19, 23].map(x => <circle key={x} cx={x} cy={15} r={0.9} fill="#ffcc00" />)}</>;
  } else if (flag) {
    const [kind, ...cols] = flag;
    base = cols[0];
    body = kind === 'v' ? cols.map((col, i) => <rect key={i} x={i * (32 / 3)} y={0} width={32 / 3 + 0.2} height={32} fill={col} />)
      : kind === 'h' ? cols.map((col, i) => <rect key={i} x={0} y={4 + i * 8.5} width={32} height={8.7} fill={col} />)
      : kind === 'cross' ? <><rect x={12} y={0} width={4} height={32} fill={cols[1]} /><rect x={0} y={13} width={32} height={4} fill={cols[1]} /></>
      : <><rect x={14.5} y={11} width={3} height={9} fill={cols[1]} /><rect x={11.5} y={14} width={9} height={3} fill={cols[1]} /></>;
  } else if (/polka|dot/.test(c)) {
    const dot = plainOf(c.replace(/polka ?dots?|polkadot|dots?/g, '').trim()) ?? '#d7262e';
    base = '#ffffff';
    body = <>
      <pattern id={`j${id}p`} width={5} height={5} patternUnits="userSpaceOnUse"><circle cx={2.5} cy={2.5} r={1.3} fill={dot === '#ffffff' ? '#d7262e' : dot} /></pattern>
      <rect width={32} height={32} fill={`url(#j${id}p)`} />
    </>;
  } else if (/number/.test(c)) {
    // Combativity and team prizes: a coloured race number on a white jersey
    const num = plainOf(c.replace('number', '').trim()) ?? '#d7262e';
    base = '#ffffff';
    body = <rect x={12} y={14} width={8} height={7} rx={1} fill={num === '#ffffff' ? '#d7262e' : num} />;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title ?? `${color ?? nat ?? ''} jersey`} style={{ flex: 'none', verticalAlign: 'middle' }}>
      {title && <title>{title}</title>}
      <defs><clipPath id={clip}><path d={SHIRT} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}><rect width={32} height={32} fill={base} />{body}</g>
      <path d={SHIRT} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

/** Usual colours of the classifications, for races whose page does not name them. */
export const DEFAULT_COLORS: Record<string, string> = { gc: 'yellow', points: 'green', mountains: 'polkadot', youth: 'white' };
