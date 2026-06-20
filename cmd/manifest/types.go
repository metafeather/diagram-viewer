package main

// Node represents a single entry in the manifest tree (layer, scenario, or steps).
type Node struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Overlay  string `json:"overlay,omitempty"`
	Children []Node `json:"children,omitempty"`
	Steps    []Step `json:"steps,omitempty"`
}

// Step represents a numbered step within a "steps" node.
type Step struct {
	Step  int    `json:"step"`
	Path  string `json:"path"`
	Title string `json:"title"`
}

// Manifest represents the top-level manifest JSON structure.
// Metadata fields (name, title, version, generated, description) are
// deliberately captured as raw JSON to allow round-tripping without
// modeling them as typed fields in v1.
type Manifest struct {
	Name        string `json:"name,omitempty"`
	Title       string `json:"title,omitempty"`
	Version     string `json:"version,omitempty"`
	Generated   string `json:"generated,omitempty"`
	Description string `json:"description,omitempty"`
	Layers      []Node `json:"layers"`
}
