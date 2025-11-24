import { globalState } from "../data/variable";
import { drawObjects, redrawAll } from "./drawing";
import {
  canvas,
  replayButton,
  reselectButton,
  interceptionButton,
} from "../data/domElements";

// Function to handle mouse hover
export function handleMouseHover(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  globalState.hoverObjectIndex = globalState.objects.findIndex(
    (object) =>
      Math.hypot(mouseX - object.x, mouseY - object.y) <= object.radius
  );

  redrawAll();
}

// Function to handle object selection
export function handleObjectSelection(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  for (let object of globalState.objects) {
    const distance = Math.hypot(mouseX - object.x, mouseY - object.y);

    // ========== NEW: Skip bomb (cannot be selected) ==========
    if (object.isBomb || object.canBeSelected === false) {
      continue;
    }
    // ========================================================

    if (
      distance <= object.radius &&
      !object.isSelected &&
      globalState.selectedObjects.length < globalState.NUM_SELECTIONS
    ) {
      object.isSelected = true;
      object.selectionIndex = globalState.selectedObjects.length;
      globalState.selectedObjects.push(object.index); // store the index of the object
      drawObjects();

      replayButton.disabled = true; // Disables the button

      reselectButton.style.display = "block";
      reselectButton.disabled = false;

      if (globalState.selectedObjects.length === globalState.NUM_SELECTIONS) {
        canvas.removeEventListener("click", handleObjectSelection);
        canvas.removeEventListener("mousemove", handleMouseHover);
        interceptionButton.style.display = "block";
      }
      break;
    }
  }
}
