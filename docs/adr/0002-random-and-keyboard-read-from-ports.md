# Random bytes and keys are read from ports

easy6502 maps its random byte at `$fe` and its last key at `$ff` in memory. easyZ80 reads them from I/O ports instead, because that is how Z80 machines talk to their devices, and a beginner who moves on to a real Z80 machine keeps the habit:

| Address | Role |
|---|---|
| `#0000` | the program is loaded here, and the CPU starts here with SP at `#FFFF` |
| `#4000`–`#43FF` | the screen: one byte per pixel, 32 pixels per row, the low 4 bits pick one of 16 colours |
| port `#FE` | `IN A,(#FE)` reads a random byte |
| port `#FF` | `IN A,(#FF)` reads the code of the last key pressed, or 0, and clears it |

## Consequences

- The tutorial introduces `IN` early, in the chapter that first needs randomness or a key.
- Reading a key clears it, so a program never sees the same press twice and needs no write to acknowledge it, unlike easy6502.
- The ports are decoded on the low byte only: `IN A,(n)` puts A on the high byte of the address bus.
- A program placed by `org` starts at its first byte, not at `#0000`: the machine sets PC to the first block it loads.
