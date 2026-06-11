package tests

import (
	"strings"
	"testing"

	"github.com/playwright-community/playwright-go"
)

// navigateToMulti navigates to multi.html and waits for both diagram-viewer instances.
func navigateToMulti(t *testing.T, page playwright.Page) {
	t.Helper()
	_, err := page.Goto(server.URL+"/examples/multi.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate to multi.html: %v", err)
	}
	_, err = page.WaitForFunction(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		return !!(left && left.shadowRoot && left.shadowRoot.querySelector('diagram-canvas')
			&& right && right.shadowRoot && right.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(15000)})
	if err != nil {
		t.Fatalf("multi instances did not attach: %v", err)
	}
}

// multiInstance returns a JS selector expression for a viewer by id.
func multiInstance(id string) string {
	return `document.getElementById('` + id + `')`
}

func TestMulti_StorageIsolation(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Set zoom on left to 300%, right to 50%
	_, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftCanvas = left.shadowRoot.querySelector('diagram-canvas');
		const rightCanvas = right.shadowRoot.querySelector('diagram-canvas');
		leftCanvas.setZoom(300);
		rightCanvas.setZoom(50);
	}`)
	if err != nil {
		t.Fatalf("could not set zoom: %v", err)
	}

	// Wait for storage to persist
	page.WaitForTimeout(500)

	// Reload
	_, err = page.Reload(playwright.PageReloadOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not reload: %v", err)
	}
	navigateToMulti(t, page)

	// Assert each retains its own zoom
	result, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftCanvas = left.shadowRoot.querySelector('diagram-canvas');
		const rightCanvas = right.shadowRoot.querySelector('diagram-canvas');
		return {
			leftZoom: leftCanvas.getZoom(),
			rightZoom: rightCanvas.getZoom(),
		};
	}`)
	if err != nil {
		t.Fatalf("could not read zoom: %v", err)
	}
	m := result.(map[string]interface{})
	leftZoom := toFloat(m["leftZoom"])
	rightZoom := toFloat(m["rightZoom"])
	if leftZoom != 300 {
		t.Errorf("left zoom: want 300, got %v", leftZoom)
	}
	if rightZoom != 50 {
		t.Errorf("right zoom: want 50, got %v", rightZoom)
	}
}

func TestMulti_SlideIsolation(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Navigate left to etcd, right to kube-scheduler
	result, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftTree = left.shadowRoot.querySelector('diagram-nav-tree');
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');

		// Click item with id containing 'etcd' in left tree
		const leftItems = leftTree.shadowRoot.querySelectorAll('.nav-item');
		let leftTarget = null;
		for (const item of leftItems) {
			if (item.dataset.id && item.dataset.id.includes('etcd')) {
				leftTarget = item; break;
			}
		}
		// Click item with id containing 'kube-scheduler' in right tree
		const rightItems = rightTree.shadowRoot.querySelectorAll('.nav-item');
		let rightTarget = null;
		for (const item of rightItems) {
			if (item.dataset.id && item.dataset.id.includes('kube-scheduler')) {
				rightTarget = item; break;
			}
		}

		if (!leftTarget) return {error: 'no etcd item in left'};
		if (!rightTarget) return {error: 'no kube-scheduler item in right'};

		leftTarget.click();
		rightTarget.click();

		// Re-query active items
		const leftActive = leftTree.shadowRoot.querySelector('.nav-item.active');
		const rightActive = rightTree.shadowRoot.querySelector('.nav-item.active');

		return {
			leftActiveId: leftActive ? leftActive.dataset.id : null,
			rightActiveId: rightActive ? rightActive.dataset.id : null,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if e, ok := m["error"]; ok {
		t.Fatalf("setup error: %v", e)
	}
	leftId := m["leftActiveId"]
	rightId := m["rightActiveId"]
	if leftId == nil || rightId == nil {
		t.Fatalf("active items missing: left=%v right=%v", leftId, rightId)
	}
	if !strings.Contains(leftId.(string), "etcd") {
		t.Errorf("left active should be etcd, got %v", leftId)
	}
	if !strings.Contains(rightId.(string), "kube-scheduler") {
		t.Errorf("right active should be kube-scheduler, got %v", rightId)
	}
	if leftId == rightId {
		t.Error("both instances show same active item — slide isolation broken")
	}
}

func TestMulti_HashOwnership(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Navigate left (non-bookmarkable) to etcd — hash should NOT change
	// Navigate right (bookmarkable primary) to kube-scheduler — hash SHOULD change
	result, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftTree = left.shadowRoot.querySelector('diagram-nav-tree');
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');

		// Navigate left
		const leftItems = leftTree.shadowRoot.querySelectorAll('.nav-item');
		let leftTarget = null;
		for (const item of leftItems) {
			if (item.dataset.id && item.dataset.id.includes('etcd')) {
				leftTarget = item; break;
			}
		}
		if (leftTarget) leftTarget.click();
		const hashAfterLeft = location.hash;

		// Navigate right
		const rightItems = rightTree.shadowRoot.querySelectorAll('.nav-item');
		let rightTarget = null;
		for (const item of rightItems) {
			if (item.dataset.id && item.dataset.id.includes('kube-scheduler')) {
				rightTarget = item; break;
			}
		}
		if (rightTarget) rightTarget.click();
		const hashAfterRight = location.hash;

		return {hashAfterLeft, hashAfterRight};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	hashAfterLeft := m["hashAfterLeft"].(string)
	hashAfterRight := m["hashAfterRight"].(string)

	// Left (non-bookmarkable) should not have set hash to etcd
	if strings.Contains(hashAfterLeft, "etcd") {
		t.Errorf("non-bookmarkable left set hash: %s", hashAfterLeft)
	}
	// Right (bookmarkable primary) should have set hash
	if !strings.Contains(hashAfterRight, "kube-scheduler") {
		t.Errorf("bookmarkable right did not set hash: %s", hashAfterRight)
	}
}

func TestMulti_ResetScope(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Set right zoom to 200 and navigate to an item, then reset left
	result, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const rightCanvas = right.shadowRoot.querySelector('diagram-canvas');
		rightCanvas.setZoom(200);

		// Navigate right to kube-scheduler
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');
		const rightItems = rightTree.shadowRoot.querySelectorAll('.nav-item');
		for (const item of rightItems) {
			if (item.dataset.id && item.dataset.id.includes('kube-scheduler')) {
				item.click(); break;
			}
		}

		// Reset left
		left.reset();

		// Check right state is unchanged
		const rightZoom = rightCanvas.getZoom();
		const rightActive = rightTree.shadowRoot.querySelector('.nav-item.active');

		// Check right's localStorage key still exists
		const keys = Object.keys(localStorage);
		const rightKeyExists = keys.some(k => k.includes('right'));

		return {
			rightZoom,
			rightActiveId: rightActive ? rightActive.dataset.id : null,
			rightKeyExists,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	rightZoom := toFloat(m["rightZoom"])
	if rightZoom != 200 {
		t.Errorf("right zoom changed after left reset: got %v, want 200", rightZoom)
	}
	if m["rightActiveId"] == nil || !strings.Contains(m["rightActiveId"].(string), "kube-scheduler") {
		t.Errorf("right active changed after left reset: %v", m["rightActiveId"])
	}
	if m["rightKeyExists"] != true {
		t.Error("right localStorage key deleted by left reset")
	}
}

func TestMulti_KeyboardScope(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Get initial active IDs, focus left, ArrowDown, check only left changed
	result, err := page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftTree = left.shadowRoot.querySelector('diagram-nav-tree');
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');

		const leftActive = () => {
			const a = leftTree.shadowRoot.querySelector('.nav-item.active');
			return a ? a.dataset.id : null;
		};
		const rightActive = () => {
			const a = rightTree.shadowRoot.querySelector('.nav-item.active');
			return a ? a.dataset.id : null;
		};

		return {
			leftBefore: leftActive(),
			rightBefore: rightActive(),
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	before := result.(map[string]interface{})

	// Focus left viewer and press ArrowDown
	_, _ = page.Evaluate(`() => {
		document.getElementById('left').focus();
	}`)
	page.Keyboard().Press("ArrowDown")
	page.WaitForTimeout(300)

	result, err = page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftTree = left.shadowRoot.querySelector('diagram-nav-tree');
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');
		const leftActive = leftTree.shadowRoot.querySelector('.nav-item.active');
		const rightActive = rightTree.shadowRoot.querySelector('.nav-item.active');
		return {
			leftAfter: leftActive ? leftActive.dataset.id : null,
			rightAfter: rightActive ? rightActive.dataset.id : null,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	after := result.(map[string]interface{})

	// Left should have advanced
	if after["leftAfter"] == before["leftBefore"] {
		t.Error("ArrowDown on focused left did not advance left")
	}
	// Right should be unchanged
	if after["rightAfter"] != before["rightBefore"] {
		t.Errorf("ArrowDown on left affected right: before=%v after=%v",
			before["rightBefore"], after["rightAfter"])
	}

	// Now focus right and press ArrowDown
	rightBefore := after["rightAfter"]
	leftBefore2 := after["leftAfter"]
	_, _ = page.Evaluate(`() => {
		document.getElementById('right').focus();
	}`)
	page.Keyboard().Press("ArrowDown")
	page.WaitForTimeout(300)

	result, err = page.Evaluate(`() => {
		const left = document.getElementById('left');
		const right = document.getElementById('right');
		const leftTree = left.shadowRoot.querySelector('diagram-nav-tree');
		const rightTree = right.shadowRoot.querySelector('diagram-nav-tree');
		const leftActive = leftTree.shadowRoot.querySelector('.nav-item.active');
		const rightActive = rightTree.shadowRoot.querySelector('.nav-item.active');
		return {
			leftAfter: leftActive ? leftActive.dataset.id : null,
			rightAfter: rightActive ? rightActive.dataset.id : null,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	after2 := result.(map[string]interface{})

	if after2["rightAfter"] == rightBefore {
		t.Error("ArrowDown on focused right did not advance right")
	}
	if after2["leftAfter"] != leftBefore2 {
		t.Errorf("ArrowDown on right affected left: before=%v after=%v",
			leftBefore2, after2["leftAfter"])
	}
}

func TestMulti_CSSLeak(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	result, err := page.Evaluate(`() => {
		const bodyFont = getComputedStyle(document.body).fontFamily;
		// Check no <style> elements injected into light DOM by the viewers
		const lightStyles = document.querySelectorAll('body > style, diagram-viewer > style');
		return {
			bodyFont,
			lightStyleCount: lightStyles.length,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	bodyFont := m["bodyFont"].(string)

	// The page sets font-family: system-ui, sans-serif on body.
	// The viewer must NOT override it in light DOM. Verify it's the page default.
	if !strings.Contains(bodyFont, "system-ui") && !strings.Contains(bodyFont, "sans-serif") {
		t.Errorf("body fontFamily overridden by viewer: %s", bodyFont)
	}

	lightStyleCount := toFloat(m["lightStyleCount"])
	if lightStyleCount > 0 {
		t.Errorf("viewer injected %v <style> elements into light DOM", lightStyleCount)
	}
}

func TestMulti_DoubleDefineSafety(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)
	navigateToMulti(t, page)

	// Re-evaluate the bundle — should not throw
	result, err := page.Evaluate(`async () => {
		const originalCtor = customElements.get('diagram-viewer');
		let threw = false;
		let errorMsg = '';
		try {
			await import('../dist/diagram-viewer.js?' + Date.now());
		} catch(e) {
			threw = true;
			errorMsg = e.message;
		}
		const ctorAfter = customElements.get('diagram-viewer');
		// Existing instances should still respond
		const left = document.getElementById('left');
		let loadDataWorks = false;
		try {
			const resp = await fetch('kubernetes/manifest.json');
			const data = await resp.json();
			left.loadData(data);
			loadDataWorks = true;
		} catch(e) {}

		return {
			threw,
			errorMsg,
			sameConstructor: originalCtor === ctorAfter,
			loadDataWorks,
		};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["threw"] == true {
		t.Fatalf("re-evaluating bundle threw: %v", m["errorMsg"])
	}
	if m["sameConstructor"] != true {
		t.Error("customElements.get('diagram-viewer') returned different constructor after re-define")
	}
	if m["loadDataWorks"] != true {
		t.Error("existing instance no longer responds to loadData after re-define")
	}
}

func TestMulti_DefineConflictWarning(t *testing.T) {
	page := newPage(t)
	clearLocalStorage(t, page)

	// Navigate to a blank page first, pre-register stub, then load bundle
	_, err := page.Goto(server.URL+"/examples/multi.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateDomcontentloaded,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}

	// Collect console warnings
	var warnings []string
	page.On("console", func(msg playwright.ConsoleMessage) {
		if msg.Type() == "warning" {
			warnings = append(warnings, msg.Text())
		}
	})

	// Pre-register a stub element before loading the bundle in a fresh context
	result, err := page.Evaluate(`async () => {
		// Fresh page — define a stub before the real bundle
		if (!customElements.get('diagram-viewer')) {
			customElements.define('diagram-viewer', class extends HTMLElement {});
		}
		let threw = false;
		let errorMsg = '';
		try {
			// Load the real bundle — should detect conflict and warn
			const script = document.createElement('script');
			script.type = 'module';
			script.src = '../dist/diagram-viewer.js?' + Date.now();
			document.head.appendChild(script);
			await new Promise((resolve, reject) => {
				script.onload = resolve;
				script.onerror = reject;
			});
			// Give it a tick to execute
			await new Promise(r => setTimeout(r, 200));
		} catch(e) {
			threw = true;
			errorMsg = e.message;
		}
		return {threw, errorMsg};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["threw"] == true {
		t.Fatalf("loading bundle with pre-registered element threw: %v", m["errorMsg"])
	}

	// Wait a moment for console messages to arrive
	page.WaitForTimeout(500)

	// Check that at least one warning mentions 'diagram-viewer'
	found := false
	for _, w := range warnings {
		if strings.Contains(w, "diagram-viewer") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected console.warn mentioning 'diagram-viewer', got warnings: %v", warnings)
	}
}
