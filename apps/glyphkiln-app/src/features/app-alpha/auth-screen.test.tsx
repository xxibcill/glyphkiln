// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthScreen } from "./auth-screen";

describe("AuthScreen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("offers bootstrap, login, and one-time invitation registration", () => {
    const bootstrap = vi.fn(() => Promise.resolve());
    const login = vi.fn(() => Promise.resolve());
    const invitation = vi.fn(() => Promise.resolve());
    act(() => {
      root.render(
        <AuthScreen
          isBusy={false}
          onBootstrap={bootstrap}
          onLogin={login}
          onInvitationRegister={invitation}
        />,
      );
    });

    setInput("#bootstrap-token", "operator-bootstrap-token-for-ui-test");
    setInput("#bootstrap-display-name", "Installation Owner");
    setInput("#bootstrap-email", "owner@example.test");
    setInput("#bootstrap-password", "correct horse battery staple");
    setInput("#bootstrap-workspace", "Foundry Studio");
    clickButton("Create owner and workspace");
    expect(bootstrap).toHaveBeenCalledWith({
      bootstrapToken: "operator-bootstrap-token-for-ui-test",
      displayName: "Installation Owner",
      email: "owner@example.test",
      password: "correct horse battery staple",
      workspaceName: "Foundry Studio",
    });

    clickButton("Sign in");
    setInput("#login-email", "owner@example.test");
    setInput("#login-password", "correct horse battery staple");
    clickSubmit();
    expect(login).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "correct horse battery staple",
    });

    clickButton("Join by invite");
    setInput("#invite-display-name", "Invited Editor");
    setInput("#invite-email", "editor@example.test");
    setInput("#invite-password", "a sufficiently long password");
    setInput("#invite-token", "invitation-token-with-at-least-32-characters");
    clickButton("Register and join workspace");
    expect(invitation).toHaveBeenCalledWith({
      displayName: "Invited Editor",
      email: "editor@example.test",
      password: "a sufficiently long password",
      invitationToken: "invitation-token-with-at-least-32-characters",
    });
  });

  function clickButton(label: string): void {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) {
      throw new Error(`Button “${label}” was not found.`);
    }
    act(() => {
      button.click();
    });
  }

  function setInput(selector: string, value: string): void {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input === null) throw new Error(`Input “${selector}” was not found.`);
    const setter = Reflect.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter === undefined) throw new Error("Input value setter was not found.");
    act(() => {
      Reflect.apply(setter, input, [value]);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function clickSubmit(): void {
    const button = container.querySelector<HTMLButtonElement>(
      "form button[type='submit']",
    );
    if (button === null) throw new Error("Submit button was not found.");
    act(() => {
      button.click();
    });
  }
});
