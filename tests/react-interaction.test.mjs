import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createServer as createViteServer } from "vite";

const browserGlobalNames = [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "localStorage",
];

function installTestDom() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/",
  });
  const previousDescriptors = new Map(
    browserGlobalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );

  for (const name of browserGlobalNames) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: dom.window[name],
    });
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });

  return {
    dom,
    restore() {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      for (const [name, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          delete globalThis[name];
        }
      }
      dom.window.close();
    },
  };
}

function InteractionProbe() {
  const [activated, setActivated] = useState(false);

  return createElement(
    "button",
    { type: "button", onClick: () => setActivated(true) },
    activated ? "Activated" : "Ready",
  );
}

test("mounts, interacts with, and unmounts a React component", async () => {
  const testDom = installTestDom();

  try {
    const { createRoot } = await import("react-dom/client");
    const container = document.querySelector("#root");
    assert.ok(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(InteractionProbe));
    });
    const button = container.querySelector("button");
    assert.ok(button);
    assert.equal(button.textContent, "Ready");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(button.textContent, "Activated");

    await act(async () => {
      root.unmount();
    });
    assert.equal(container.innerHTML, "");
  } finally {
    testDom.restore();
  }
});

test("submits a controlled Speaking 01 recognition for the active learner", async () => {
  const testDom = installTestDom();
  let root;
  let vite;

  try {
    vite = await createViteServer({
      root: fileURLToPath(new URL("..", import.meta.url)),
      configFile: false,
      server: { middlewareMode: true },
      appType: "custom",
    });
    const { LearnerJourney } = await vite.ssrLoadModule(
      "/app/learner-journey.tsx",
    );
    const { createRoot } = await import("react-dom/client");
    const container = document.querySelector("#root");
    assert.ok(container);
    const recognizedLearnerIds = [];
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(LearnerJourney, {
        learnerId: "learner-2",
        initialProgress: {
          learnerId: "learner-2",
          completedActivityIds: ["SVO-01"],
          completedListeningActivityIds: ["LISTEN-SVO-01"],
        },
        recognizeSpeaking01: async ({ learnerId }) => {
          recognizedLearnerIds.push(learnerId);
          return { recognizedText: "Anna likes music." };
        },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const speakingCard = container.querySelector(
      '[data-activity-id="SPEAK-SVO-01"]',
    );
    assert.ok(speakingCard);
    const startButton = speakingCard.querySelector(
      '[data-speaking-action="start"]',
    );
    assert.ok(startButton);
    assert.match(startButton.textContent ?? "", /Start speaking/);

    await act(async () => {
      startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.deepEqual(recognizedLearnerIds, ["learner-2"]);
    assert.match(speakingCard.textContent ?? "", /I heard:/);
    assert.match(speakingCard.textContent ?? "", /Anna likes music\./);
    assert.match(speakingCard.textContent ?? "", /Great speaking!/);
  } finally {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    await vite?.close();
    testDom.restore();
  }
});
