import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WithdrawnBadge } from "./WithdrawnBadge";

const show = (approval: Parameters<typeof WithdrawnBadge>[0]["approval"]) =>
  render(<TooltipProvider><WithdrawnBadge approval={approval} /></TooltipProvider>);

it("names the country for a single-country withdrawal", () => {
  show({ status: "approved", withdrawn: true, withdrawn_year: 2000, withdrawn_country: "Vietnam" } as never);
  expect(screen.getByText("withdrawn in Vietnam 2000")).toBeTruthy();
});
it("keeps the short label for multi-country or worldwide withdrawals", () => {
  show({ status: "approved", withdrawn: true, withdrawn_year: 1980, withdrawn_country: "France; United States" } as never);
  expect(screen.getByText("withdrawn 1980")).toBeTruthy();
});
it("renders nothing when not withdrawn", () => {
  const { container } = show({ status: "approved", withdrawn: false } as never);
  expect(container.textContent).toBe("");
});
