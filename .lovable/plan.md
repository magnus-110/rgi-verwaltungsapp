

## Problem Analysis

The amount input shows no visible size change because the `Input` component has a built-in `md:text-sm` responsive class (line 11 of `input.tsx`). On your 1422px screen (which is `md+`), Tailwind applies `md:text-sm` **in addition to** `text-4xl`. Since `md:text-sm` is a responsive variant, `twMerge` does NOT remove it when you pass `text-4xl` (a base-level class). The responsive `md:text-sm` wins at your screen size, making the number always appear small regardless of the base font size.

## Plan

### Step 1: Fix the amount input class override
In `TransactionReviewMode.tsx` at line 1167, add `md:text-4xl` alongside `text-4xl` so the responsive override is properly countered:

```
className={cn(
  "h-14 text-4xl md:text-4xl font-bold flex-1 border-none shadow-none px-0 focus-visible:ring-0",
  row.booking_type === "income" ? "text-green-600" : "text-destructive"
)}
```

This ensures `md:text-4xl` overrides the Input's built-in `md:text-sm` via Tailwind Merge, making the amount display large on all screen sizes.

### Why this happened
- `Input` component has: `text-base ... md:text-sm`
- Your code passes: `text-4xl`
- `twMerge` removes `text-base` (same breakpoint as `text-4xl`) but keeps `md:text-sm` (different breakpoint)
- At `md+` screens → `md:text-sm` applies → number stays small

Single line change, no other files affected.

