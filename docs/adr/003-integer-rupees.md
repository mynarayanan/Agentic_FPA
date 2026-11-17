# ADR-003: Money as integer rupees

Status: accepted

Decision: all amounts are integer INR. Splits use largest-remainder allocation (BigInt) so every part sums exactly to its total.
Consequences: Bridges reconcile to the rupee with no floating-point drift. Display conversion to crore is presentation only. Non-integer methods (pure volume) round once and put the residual in mix.
