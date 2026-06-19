package tests

import (
	"math"
	"testing"
)

// TestCanvas_FitViewBoxOnly verifies that an SVG with only a viewBox attribute
// (no width/height) uses the viewBox dimensions for fit-to-shortest-side scaling.
func TestCanvas_FitViewBoxOnly(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "tests/fixtures/fit/manifest.json")
	waitForIframeSrc(t, page, "viewbox_only.svg")

	// Expected viewBox dimensions
	const expectedW = 1200.0
	const expectedH = 400.0

	// Read baseWidth/baseHeight from the iframe dataset
	dims, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		return {
			baseWidth: parseFloat(iframe.dataset.baseWidth),
			baseHeight: parseFloat(iframe.dataset.baseHeight),
		};
	}`)
	if err != nil {
		t.Fatalf("could not read iframe dataset: %v", err)
	}
	dimMap := dims.(map[string]interface{})
	baseW := toFloat(dimMap["baseWidth"])
	baseH := toFloat(dimMap["baseHeight"])

	if baseW != expectedW {
		t.Errorf("baseWidth: got %v, want %v (should use viewBox width, not iframe viewport)", baseW, expectedW)
	}
	if baseH != expectedH {
		t.Errorf("baseHeight: got %v, want %v (should use viewBox height, not iframe viewport)", baseH, expectedH)
	}

	// Verify cover-fit scale uses Math.max (fit-to-shortest-side)
	scaleResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		const viewerW = canvas.clientWidth;
		const viewerH = canvas.clientHeight;
		const baseW = parseFloat(iframe.dataset.baseWidth);
		const baseH = parseFloat(iframe.dataset.baseHeight);
		const transform = iframe.style.transform;
		const match = transform.match(/scale\(([^)]+)\)/);
		const actualScale = match ? parseFloat(match[1]) : NaN;
		const padding = 32; // 2rem at 16px
		const expectedScale = Math.max((viewerW - padding) / baseW, (viewerH - padding) / baseH);
		return { actualScale, expectedScale, viewerW, viewerH };
	}`)
	if err != nil {
		t.Fatalf("could not evaluate scale: %v", err)
	}
	scaleMap := scaleResult.(map[string]interface{})
	actualScale := toFloat(scaleMap["actualScale"])
	expectedScale := toFloat(scaleMap["expectedScale"])

	if math.IsNaN(actualScale) {
		t.Fatal("no scale() found in iframe transform style")
	}
	if math.Abs(actualScale-expectedScale) > 0.001 {
		t.Errorf("cover-fit scale: got %v, want %v (should use Math.max for fit-to-shortest-side)\n  viewerW=%.0f viewerH=%.0f baseW=%.0f baseH=%.0f",
			actualScale, expectedScale,
			toFloat(scaleMap["viewerW"]), toFloat(scaleMap["viewerH"]),
			baseW, baseH)
	}
}

// TestCanvas_FitPercentSize verifies that an SVG with percentage width/height
// attributes uses the viewBox dimensions instead of the percentage values.
func TestCanvas_FitPercentSize(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "tests/fixtures/fit/manifest.json")
	waitForIframeSrc(t, page, "viewbox_only.svg")

	// Navigate to the second slide (percent_size.svg) via keyboard
	hoverViewer(t, page)
	page.Keyboard().Press("ArrowDown")
	waitForIframeSrc(t, page, "percent_size.svg")

	// Expected viewBox dimensions
	const expectedW = 600.0
	const expectedH = 800.0

	// Read baseWidth/baseHeight from the iframe dataset
	dims, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		return {
			baseWidth: parseFloat(iframe.dataset.baseWidth),
			baseHeight: parseFloat(iframe.dataset.baseHeight),
		};
	}`)
	if err != nil {
		t.Fatalf("could not read iframe dataset: %v", err)
	}
	dimMap := dims.(map[string]interface{})
	baseW := toFloat(dimMap["baseWidth"])
	baseH := toFloat(dimMap["baseHeight"])

	if baseW != expectedW {
		t.Errorf("baseWidth: got %v, want %v (should use viewBox width, not percentage attr)", baseW, expectedW)
	}
	if baseH != expectedH {
		t.Errorf("baseHeight: got %v, want %v (should use viewBox height, not percentage attr)", baseH, expectedH)
	}

	// Verify cover-fit scale uses Math.max (fit-to-shortest-side)
	scaleResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		const viewerW = canvas.clientWidth;
		const viewerH = canvas.clientHeight;
		const baseW = parseFloat(iframe.dataset.baseWidth);
		const baseH = parseFloat(iframe.dataset.baseHeight);
		const transform = iframe.style.transform;
		const match = transform.match(/scale\(([^)]+)\)/);
		const actualScale = match ? parseFloat(match[1]) : NaN;
		const padding = 32; // 2rem at 16px
		const expectedScale = Math.max((viewerW - padding) / baseW, (viewerH - padding) / baseH);
		return { actualScale, expectedScale, viewerW, viewerH };
	}`)
	if err != nil {
		t.Fatalf("could not evaluate scale: %v", err)
	}
	scaleMap := scaleResult.(map[string]interface{})
	actualScale := toFloat(scaleMap["actualScale"])
	expectedScale := toFloat(scaleMap["expectedScale"])

	if math.IsNaN(actualScale) {
		t.Fatal("no scale() found in iframe transform style")
	}
	if math.Abs(actualScale-expectedScale) > 0.001 {
		t.Errorf("cover-fit scale: got %v, want %v (should use Math.max for fit-to-shortest-side)\n  viewerW=%.0f viewerH=%.0f baseW=%.0f baseH=%.0f",
			actualScale, expectedScale,
			toFloat(scaleMap["viewerW"]), toFloat(scaleMap["viewerH"]),
			baseW, baseH)
	}
}

// TestCanvas_RefitOnResize verifies that resizing the viewport causes the
// diagram to recompute its fit scale via ResizeObserver.
func TestCanvas_RefitOnResize(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "tests/fixtures/fit/manifest.json")
	waitForIframeSrc(t, page, "viewbox_only.svg")

	// Record initial scale
	getScale := `() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		const transform = iframe.style.transform;
		const match = transform.match(/scale\(([^)]+)\)/);
		return match ? parseFloat(match[1]) : NaN;
	}`

	initialResult, err := page.Evaluate(getScale)
	if err != nil {
		t.Fatalf("could not read initial scale: %v", err)
	}
	initialScale := toFloat(initialResult)
	if math.IsNaN(initialScale) {
		t.Fatal("no scale() found in iframe transform style before resize")
	}

	// Resize the viewport
	if err := page.SetViewportSize(800, 1200); err != nil {
		t.Fatalf("could not resize viewport: %v", err)
	}

	// Wait for ResizeObserver + rAF to fire (ResizeObserver is async, needs extra time)
	page.Evaluate(`() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 100))`)

	// Read new scale
	newResult, err := page.Evaluate(getScale)
	if err != nil {
		t.Fatalf("could not read new scale: %v", err)
	}
	newScale := toFloat(newResult)
	if math.IsNaN(newScale) {
		t.Fatal("no scale() found in iframe transform style after resize")
	}

	if math.Abs(newScale-initialScale) < 0.001 {
		t.Errorf("scale did not change after resize: before=%v after=%v", initialScale, newScale)
	}

	// Verify the new scale matches cover-fit formula for new viewport
	verifyResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		const viewerW = canvas.clientWidth;
		const viewerH = canvas.clientHeight;
		const baseW = parseFloat(iframe.dataset.baseWidth);
		const baseH = parseFloat(iframe.dataset.baseHeight);
		const padding = 32;
		const expectedScale = Math.max((viewerW - padding) / baseW, (viewerH - padding) / baseH);
		const transform = iframe.style.transform;
		const match = transform.match(/scale\(([^)]+)\)/);
		const actualScale = match ? parseFloat(match[1]) : NaN;
		return { actualScale, expectedScale };
	}`)
	if err != nil {
		t.Fatalf("could not verify new scale: %v", err)
	}
	verifyMap := verifyResult.(map[string]interface{})
	actualScale := toFloat(verifyMap["actualScale"])
	expectedScale := toFloat(verifyMap["expectedScale"])

	if math.Abs(actualScale-expectedScale) > 0.001 {
		t.Errorf("after resize: scale=%v, expected=%v (cover-fit formula mismatch)", actualScale, expectedScale)
	}
}
