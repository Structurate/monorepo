import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px',
});

export const headerTitle = style({
  fontSize: '16px',
  fontWeight: '500',
  color: cssVarV2('text/primary'),
});

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});
