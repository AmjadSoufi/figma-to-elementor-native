// ─────────────────────────────────────────────────────────────────────────────
// code.ts — Figma Plugin Main Thread
// Runs in the Figma plugin sandbox (not the browser).
// Communicates with the UI (ui.html) via postMessage.
// ─────────────────────────────────────────────────────────────────────────────

import { UIMessage, PluginMessage, ConversionOptions } from './types/figma-extended';
import { DEFAULT_OPTIONS, runConversion } from './converter/index';
import { runPreflight } from './converter/preflight';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Initialization
// ─────────────────────────────────────────────────────────────────────────────

figma.showUI(__html__, {
  width: 400,
  height: 560,
  title: 'Figma → Elementor Native',
  themeColors: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function send(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  console[level](`[F2E] ${message}`);
  send({ type: 'log', message, level });
}

function getSelectedFrame(): FrameNode | ComponentNode | null {
  const sel = figma.currentPage.selection;
  if (!sel || sel.length === 0) return null;
  const node = sel[0];
  if (node.type === 'FRAME' || node.type === 'COMPONENT') {
    return node as FrameNode | ComponentNode;
  }
  return null;
}

function getFileKey(): string {
  // figma.fileKey may not be available in all contexts
  try {
    return (figma as unknown as { fileKey?: string }).fileKey ?? '';
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection Change Listener
// ─────────────────────────────────────────────────────────────────────────────

figma.on('selectionchange', () => {
  const frame = getSelectedFrame();
  send({
    type: 'selection-changed',
    hasSelection: frame !== null,
    nodeName: frame?.name,
    nodeId: frame?.id,
  });
});

// Notify UI of initial selection state
const initialFrame = getSelectedFrame();
send({
  type: 'selection-changed',
  hasSelection: initialFrame !== null,
  nodeName: initialFrame?.name,
  nodeId: initialFrame?.id,
});

// Load saved settings
figma.clientStorage.getAsync('f2e-settings').then(settings => {
  if (settings) {
    send({ type: 'load-settings', settings });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Message Handler
// ─────────────────────────────────────────────────────────────────────────────

figma.ui.onmessage = async (rawMsg: unknown) => {
  const msg = rawMsg as UIMessage;

  switch (msg.type) {

    // ── RESIZE ───────────────────────────────────────────────────────────────
    case 'resize': {
      figma.ui.resize(msg.width, msg.height);
      break;
    }

    // ── ANALYZE (Pre-flight) ──────────────────────────────────────────────
    case 'analyze': {
      const frame = getSelectedFrame();
      if (!frame) {
        send({ type: 'conversion-error', error: 'Please select a Frame or Component in Figma.' });
        break;
      }

      log(`Running pre-flight on: ${frame.name}`);

      try {
        const report = runPreflight(frame, msg.options);
        send({ type: 'preflight-result', report });
        log(`Pre-flight complete. Score: ${report.score}/100 (Grade ${report.grade})`, 'info');
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log(`Pre-flight error: \n${err instanceof Error && err.stack ? err.stack : message}`, 'error');
        send({ type: 'conversion-error', error: `Pre-flight failed: ${message}` });
      }
      break;
    }

    // ── CONVERT ───────────────────────────────────────────────────────────
    case 'convert': {
      const frame = getSelectedFrame();
      if (!frame) {
        send({ type: 'conversion-error', error: 'Please select a Frame or Component in Figma.' });
        break;
      }

      log(`Starting conversion: ${frame.name}`);

      const opts: ConversionOptions = {
        ...DEFAULT_OPTIONS,
        ...(msg.options ?? {}),
      };

      try {
        const result = await runConversion(
          frame,
          opts,
          (step, percent) => {
            send({ type: 'conversion-progress', step, percent });
          },
          getFileKey()
        );

        log(`Conversion complete. Elements: ${result.elementCount}, Flagged: ${result.flaggedCount}, Score: ${result.fidelityScore}%`);

        // Send JSON to UI for download / WP push
        send({
          type: 'conversion-complete',
          json: result.json,
          flaggedCount: result.flaggedCount,
          fidelityScore: result.fidelityScore,
        });

        // Send images to UI if any
        if (result.imageExports && result.imageExports.length > 0) {
          send({
            type: 'images-exported',
            images: result.imageExports,
          });
        }

        if (result.warnings.length > 0) {
          result.warnings.forEach((w) => log(w, 'warn'));
        }
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log(`Conversion error: \n${err instanceof Error && err.stack ? err.stack : message}`, 'error');
        send({ type: 'conversion-error', error: `Conversion failed: ${message}` });
      }
      break;
    }

    // ── FIX ISSUE ─────────────────────────────────────────────────────────
    case 'fix-issue': {
      // Always respond with a fix-result so the UI can exit its "Fixing…"
      // spinner, even if something goes wrong mid-flight.
      let fixed = 0;
      try {
        const frame = getSelectedFrame();
        if (!frame) {
          send({ type: 'conversion-error', error: 'No frame selected.' });
          // still send a fix-result with an empty report so spinner clears
          send({ type: 'fix-result', fixed: 0, code: msg.code, report: {
            score: 0, grade: 'F', issues: [], totalNodes: 0, autoLayoutNodes: 0,
            freePositionedNodes: 0, unsupportedEffectNodes: 0,
            colorStylesUsed: false, textStylesUsed: false,
          } });
          break;
        }

        for (const id of msg.nodeIds) {
          // dynamic-page access requires the async lookup
          const node = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
          if (!node) continue;

          try {
            switch (msg.code) {
              case 'BLUR_EFFECTS': {
                if ('effects' in node) {
                  const n = node as FrameNode;
                  const before = n.effects.length;
                  n.effects = n.effects.filter(
                    e => e.type !== 'BACKGROUND_BLUR' && e.type !== 'LAYER_BLUR'
                  );
                  if (n.effects.length < before) fixed++;
                }
                break;
              }
              case 'BLEND_MODES': {
                if ('blendMode' in node) {
                  (node as FrameNode).blendMode = 'NORMAL';
                  fixed++;
                }
                break;
              }
              case 'ROTATION': {
                if ('rotation' in node) {
                  (node as FrameNode).rotation = 0;
                  fixed++;
                }
                break;
              }
              case 'ABSOLUTE_POSITIONING': {
                if ('layoutPositioning' in node) {
                  (node as FrameNode).layoutPositioning = 'AUTO';
                  fixed++;
                }
                break;
              }
            }
          } catch (e) {
            log(`Could not fix node ${node.name}: ${e}`, 'warn');
          }
        }

        // Re-run preflight so UI reflects the updated state
        const updatedReport = runPreflight(frame, msg.options);
        send({ type: 'fix-result', fixed, code: msg.code, report: updatedReport });
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log(`Fix error: ${message}`, 'error');
        send({ type: 'conversion-error', error: `Fix failed: ${message}` });
        // Ensure spinner clears even on failure
        const frame = getSelectedFrame();
        const report = frame ? runPreflight(frame, msg.options) : {
          score: 0, grade: 'F' as const, issues: [], totalNodes: 0, autoLayoutNodes: 0,
          freePositionedNodes: 0, unsupportedEffectNodes: 0,
          colorStylesUsed: false, textStylesUsed: false,
        };
        send({ type: 'fix-result', fixed, code: msg.code, report });
      }
      break;
    }

    // ── SELECT NODES ──────────────────────────────────────────────────────
    case 'select-nodes': {
      // Manifest uses documentAccess: "dynamic-page", so sync node access is
      // disabled — must use getNodeByIdAsync and loadAsync before tree walks.
      try {
        const idSet = new Set(msg.nodeIds);
        const found: SceneNode[] = [];

        for (const id of msg.nodeIds) {
          try {
            const node = await figma.getNodeByIdAsync(id);
            if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
              found.push(node as SceneNode);
              idSet.delete(id);
            }
          } catch {
            // fall through to tree walk
          }
        }

        // For IDs not resolved above, walk the current page tree
        if (idSet.size > 0) {
          await figma.currentPage.loadAsync();

          function searchTree(node: SceneNode): void {
            if (idSet.has(node.id)) {
              found.push(node);
              idSet.delete(node.id);
            }
            if (idSet.size === 0) return;
            if ('children' in node) {
              for (const child of (node as FrameNode).children) {
                searchTree(child);
                if (idSet.size === 0) return;
              }
            }
          }
          for (const child of figma.currentPage.children) {
            searchTree(child as SceneNode);
            if (idSet.size === 0) break;
          }
        }

        if (found.length > 0) {
          try {
            figma.currentPage.selection = found;
          } catch {
            // Some nodes (e.g. inside locked groups) can't be selected directly
          }
          figma.viewport.scrollAndZoomIntoView(found);
          send({ type: 'log', message: `Zoomed to ${found.length} node(s)`, level: 'info' });
        } else {
          send({ type: 'log', message: `Could not find nodes: ${msg.nodeIds.join(', ')}`, level: 'warn' });
          send({ type: 'conversion-error', error: 'Could not locate those layers — try re-running Analyze first.' });
        }
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        log(`Zoom error: ${message}`, 'error');
        send({ type: 'conversion-error', error: `Zoom failed: ${message}` });
      }
      break;
    }

    // ── SAVE SETTINGS ─────────────────────────────────────────────────────
    case 'save-settings': {
      figma.clientStorage.setAsync('f2e-settings', msg.settings);
      break;
    }

    // ── CANCEL ────────────────────────────────────────────────────────────
    case 'cancel': {
      figma.closePlugin();
      break;
    }

    default:
      log(`Unknown message type: ${(msg as { type: string }).type}`, 'warn');
  }
};
