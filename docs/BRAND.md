# LEOS Carbon visual system

LEOS uses Carbon Design System colour values for interface and identity colour.
Carbon informs the tokens and visual discipline; desktop controls remain native
to the existing React component stack and Android controls remain Material 3.
Do not create look-alike custom controls.

## Logo

The open book and rising light continue to represent learning, clarity, and
steady progress. The identity is now led by Carbon Purple 60, complemented by
Blue 60 and Cyan 50.

- Primary lockup: `brand/leos-lockup.svg`
- Compact mark: `brand/leos-mark.svg`
- Clear space: at least one sun diameter around the mark.
- Minimum size: 24 px for the mark; 120 px wide for the lockup.
- Never stretch, rotate, apply gradients or shadows, or recolour the individual
  parts outside the approved Carbon identity palette.

## Core interface colours

| Semantic role | Carbon token/value | Hex | Use |
| --- | --- | --- | --- |
| Light surface | White | `#FFFFFF` | cards, dialogs, primary surfaces |
| Light background | Gray 10 | `#F4F4F4` | application canvas |
| Dark elevated surface | Gray 90 | `#262626` | dark-theme cards and fields |
| Dark background/text | Gray 100 | `#161616` | dark canvas, light-theme text and shell |
| Interactive | Blue 60 | `#0F62FE` | links, primary actions, focus and selection |
| Dark interactive | Blue 40 | `#78A9FF` | primary interaction on G90/G100 |
| Brand | Purple 60 | `#8A3FFC` | logo and restrained identity moments |
| Complement | Cyan 50 | `#1192E8` | logo light and data accents |
| Success | Green 50 | `#24A148` | confirmed completion |
| Error | Red 60 | `#DA1E28` | failed and destructive states |
| Warning | Yellow 30 | `#F1C21B` | warning background and indicators |
| Warning text | Gray 100 | `#161616` | text/icons on Yellow 30 |

Blue is the interface accent. Purple is a brand colour, not a substitute for
interactive blue. Alert colours communicate semantics and must always be paired
with text or an icon.

## Themes

Light mode uses Gray 10 behind White surfaces with Gray 100 text. Dark mode uses
Gray 100 behind Gray 90 surfaces with Gray 10 text. Do not use tinted page
backgrounds, glass effects, decorative gradients, or low-contrast translucency.
Respect the system theme unless the user explicitly selects a saved preference.

## Typography

Prefer `IBM Plex Sans`, then `Inter`, `Segoe UI`, and the platform sans-serif.
Android uses the system sans-serif for native accessibility. Use sentence case.

- Display: 32/40, semibold
- Page title: 24/32, semibold
- Section title: 18/24, semibold
- Body: 16/24, regular
- Supporting text: 14/20, regular
- Labels: 14/20, medium

## Interface and accessibility

- Use semantic colour tokens rather than feature-specific hard-coded colours.
- Maintain visible keyboard focus and at least 48 dp touch targets.
- Never communicate status using colour alone.
- Keep one primary action per form and place secondary destinations in menus.
- Support large-text reflow, keyboard navigation, and reduced motion.
- Printed documents remain White with Gray 100 text, Blue 60 headings, and alert
  colours only where the status is also written explicitly.

## Voice

Copy is direct, calm, and operational: “Attendance saved”, “No records found”,
and “Connect to the main school computer”. Avoid childish language, technical
jargon, alarmist errors, and decorative imagery in working screens.
