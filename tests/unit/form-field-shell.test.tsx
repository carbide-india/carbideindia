// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Field, MiniField } from "@/components/inquiries/form-field";

/**
 * Structure tests for the floating-label shell.
 *
 * These exist because the shell broke in a way neither typecheck nor build can
 * see: MiniField renders its label as a <span>, the CSS content rule selected
 * `> *:not(fieldset):not(label)`, and that selector matched the <span> at
 * higher specificity than `.nt-field-label` — so `position: relative` beat
 * `position: absolute` and every MiniField label in the app fell out of the
 * box and rendered underneath it. The fix is a structural one (an explicit
 * `.nt-field-body` wrapper), so the invariants are asserted structurally.
 */

const shellOf = (c: HTMLElement) => c.querySelector(".nt-field-shell")!;

describe("Field (float)", () => {
  it("puts the control in .nt-field-body and the label outside it", () => {
    const { container } = render(
      <Field id="f" label="Company Name" float>
        <input id="f" className="nt-input" />
      </Field>,
    );
    const shell = shellOf(container);
    const body = shell.querySelector(".nt-field-body")!;

    expect(body.querySelector("input")).not.toBeNull();
    // The label must NOT be inside the body — that is what the CSS keys on.
    expect(body.querySelector(".nt-field-label")).toBeNull();
    expect(shell.querySelector(":scope > .nt-field-label")).not.toBeNull();
  });

  it("keeps the label a direct child of the shell so it can be positioned", () => {
    const { container } = render(
      <Field id="g" label="Grade" float>
        <input id="g" className="nt-input" />
      </Field>,
    );
    const shell = shellOf(container);
    const direct = Array.from(shell.children).map((el) => el.className);
    expect(direct).toEqual(["nt-field-body", "nt-field-notch", "nt-field-label"]);
  });

  it("stacks anything after the control BELOW the box, never inside it", () => {
    const { container } = render(
      <Field id="h" label="Account Name" float>
        <input id="h" className="nt-input" />
        <p data-testid="err">Required</p>
      </Field>,
    );
    const shell = shellOf(container);
    const err = container.querySelector('[data-testid="err"]')!;
    // Inside the outline it would sit on the border and read as a bug.
    expect(shell.contains(err)).toBe(false);
    expect(err.closest(".nt-field-aside")).not.toBeNull();
  });

  it("renders no aside wrapper when there is only a control", () => {
    const { container } = render(
      <Field id="i" label="Qty" float>
        <input id="i" className="nt-input" />
      </Field>,
    );
    expect(container.querySelector(".nt-field-aside")).toBeNull();
  });

  it("renders the hint under the box", () => {
    const { container } = render(
      <Field id="j" label="Grade" float hint="Add options in the Masters module">
        <input id="j" className="nt-input" />
      </Field>,
    );
    const aside = container.querySelector(".nt-field-aside")!;
    expect(aside.textContent).toContain("Add options in the Masters module");
    expect(shellOf(container).contains(aside)).toBe(false);
  });

  it("pins an action inside the shell, not above it", () => {
    // A "+ Add" rendered as a label row ABOVE the box made the field taller
    // than every neighbour in the grid. It belongs on the border.
    const { container } = render(
      <Field label="Designation" labelOnly float action={<button>Add</button>}>
        <button aria-label="Designation" className="nt-input" />
      </Field>,
    );
    const shell = shellOf(container);
    const action = shell.querySelector(".nt-field-action")!;
    expect(action.parentElement).toBe(shell);
    // Not in the body (would be inside the outline) and not in the aside
    // (would sit below the box and re-introduce the height difference).
    expect(shell.querySelector(".nt-field-body")!.contains(action)).toBe(false);
    expect(container.querySelector(".nt-field-aside")).toBeNull();
  });

  it("renders no action wrapper when the caller passes none", () => {
    const { container } = render(
      <Field label="Department" labelOnly float action={undefined}>
        <button aria-label="Department" className="nt-input" />
      </Field>,
    );
    expect(container.querySelector(".nt-field-action")).toBeNull();
  });

  it("keeps the htmlFor association, and drops it for popover selects", () => {
    const { container: withFor } = render(
      <Field id="k" label="Date" float>
        <input id="k" className="nt-input" />
      </Field>,
    );
    expect(withFor.querySelector("label")?.getAttribute("for")).toBe("k");

    const { container: noFor } = render(
      <Field id="l" label="State" labelOnly float>
        <button aria-label="State" />
      </Field>,
    );
    expect(noFor.querySelector("label")?.hasAttribute("for")).toBe(false);
  });
});

describe("MiniField (float)", () => {
  it("renders the label as a span that is NOT part of the body", () => {
    const { container } = render(
      <MiniField label="Status" float>
        <select aria-label="Status" className="nt-input" />
      </MiniField>,
    );
    const shell = shellOf(container);
    const label = shell.querySelector(".nt-field-label")!;

    expect(label.tagName).toBe("SPAN");
    expect(label.parentElement).toBe(shell);
    expect(shell.querySelector(".nt-field-body")!.contains(label)).toBe(false);
  });

  it("has the same child order as Field, so one CSS rule serves both", () => {
    const { container } = render(
      <MiniField label="Location" float>
        <select aria-label="Location" className="nt-input" />
      </MiniField>,
    );
    expect(Array.from(shellOf(container).children).map((el) => el.className)).toEqual([
      "nt-field-body",
      "nt-field-notch",
      "nt-field-label",
    ]);
  });
});

describe("non-float fields are untouched", () => {
  it("still renders a stacked label with no shell", () => {
    const { container } = render(
      <Field id="m" label="Client Name" required>
        <input id="m" className="nt-input" />
      </Field>,
    );
    expect(container.querySelector(".nt-field-shell")).toBeNull();
    expect(container.querySelector("label")?.textContent).toContain("Client Name");
  });
});
