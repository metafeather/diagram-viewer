package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"oss.terrastruct.com/d2/d2compiler"
	"oss.terrastruct.com/d2/d2graph"
)

// d2Format is the Format implementation backed by the d2 compiler.
type d2Format struct{}

func (d2Format) Build(inPath string) (*Node, error) {
	entryFile := filepath.Join(inPath, "index.d2")
	src, err := os.ReadFile(entryFile)
	if err != nil {
		return nil, fmt.Errorf("reading d2 entry file: %w", err)
	}

	absPath, err := filepath.Abs(inPath)
	if err != nil {
		return nil, fmt.Errorf("resolving path: %w", err)
	}
	g, _, err := d2compiler.Compile("index.d2", strings.NewReader(string(src)), &d2compiler.CompileOptions{
		FS: os.DirFS(absPath),
	})
	if err != nil {
		return nil, fmt.Errorf("compiling d2: %w", err)
	}

	root := &Node{
		ID:    "overview",
		Title: "Overview",
		Path:  "index.svg",
		Type:  "layer",
	}

	root.Children = walkLayers(g.Layers, "")
	attachOverlays(root, absPath)
	// If root itself has scenarios (unlikely but handle)
	if len(g.Scenarios) > 0 {
		root.Type = "steps"
		root.Steps = buildSteps(g.Scenarios, "")
	}

	// Determine root type based on children
	if len(root.Children) > 0 {
		root.Type = "layer"
	}

	return root, nil
}

// walkLayers recursively walks d2 graph layers and scenarios to produce Node children.
func walkLayers(layers []*d2graph.Graph, parentPath string) []Node {
	var nodes []Node
	for _, layer := range layers {
		node := buildNode(layer, parentPath)
		nodes = append(nodes, node)
	}
	return nodes
}

// buildNode creates a Node from a d2 graph board.
func buildNode(g *d2graph.Graph, parentPath string) Node {
	name := g.Name
	id := slugify(name)

	hasLayers := len(g.Layers) > 0
	hasScenarios := len(g.Scenarios) > 0
	hasSteps := len(g.Steps) > 0

	var node Node
	node.ID = id
	node.Title = name

	switch {
	case hasScenarios:
		// Scenarios with numeric keys → "steps"
		boardPath := joinPath(parentPath, name)
		node.Path = boardPath + "/index.svg"
		node.Type = "steps"
		node.Steps = buildSteps(g.Scenarios, boardPath)

	case hasSteps:
		// Explicit d2 steps keyword
		boardPath := joinPath(parentPath, name)
		node.Path = boardPath + "/index.svg"
		node.Type = "steps"
		node.Steps = buildSteps(g.Steps, boardPath)

	case hasLayers:
		// Branch with sub-layers → "scenario"
		boardPath := joinPath(parentPath, name)
		node.Path = boardPath + "/index.svg"
		node.Type = "scenario"
		node.Children = walkLayers(g.Layers, boardPath)

	default:
		// Leaf layer
		node.Path = joinPath(parentPath, name) + ".svg"
		node.Type = "layer"
	}

	return node
}

// buildSteps creates Step entries from scenario/step sub-graphs.
func buildSteps(boards []*d2graph.Graph, parentPath string) []Step {
	steps := make([]Step, len(boards))
	for i, b := range boards {
		_ = b // We use index-based naming matching d2 CLI output
		steps[i] = Step{
			Step:  i + 1,
			Path:  fmt.Sprintf("%s/%d.svg", parentPath, i+1),
			Title: fmt.Sprintf("Step %d", i+1),
		}
	}
	return steps
}

// joinPath joins path segments, handling empty parent.
func joinPath(parent, name string) string {
	if parent == "" {
		return name
	}
	return parent + "/" + name
}



// attachOverlays walks the node tree and sets Overlay for any node whose
// source .d2 file has a sibling *.overlay.d2 file.
func attachOverlays(node *Node, srcDir string) {
	// Derive the source .d2 path from the node's output path.
	// e.g. "Foo/bar.svg" → "Foo/bar.d2", "Foo/bar/index.svg" → "Foo/bar.d2"
	if node.Path != "" {
		var basePath string
		if strings.HasSuffix(node.Path, "/index.svg") {
			basePath = strings.TrimSuffix(node.Path, "/index.svg")
		} else {
			basePath = strings.TrimSuffix(node.Path, ".svg")
		}

		overlayD2 := filepath.Join(srcDir, basePath+".overlay.d2")
		if _, err := os.Stat(overlayD2); err == nil {
			node.Overlay = basePath + ".overlay.svg"
		}
	}

	for i := range node.Children {
		attachOverlays(&node.Children[i], srcDir)
	}
}

func (d2Format) Render(inPath, outDir string, passthrough []string) error {
	// TODO: implement in render issue
	return nil
}

func init() {
	RegisterFormat("d2", d2Format{})
}
