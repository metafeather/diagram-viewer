package main

import "fmt"

// Format defines the interface for diagram format implementations.
// Each format knows how to build a manifest tree and render outputs.
type Format interface {
	// Build parses the diagram source at inPath and returns the manifest tree.
	Build(inPath string) (*Node, error)

	// Render produces rendered output files in outDir from the source at inPath.
	// The passthrough slice carries arguments after "--" that are forwarded to the
	// underlying tool.
	Render(inPath, outDir string, passthrough []string) error
}

// registry holds the registered format implementations keyed by name.
var registry = map[string]Format{}

// RegisterFormat registers a Format implementation under the given name.
func RegisterFormat(name string, f Format) {
	registry[name] = f
}

// LookupFormat returns the Format registered under name, or an error if unknown.
func LookupFormat(name string) (Format, error) {
	f, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("unsupported format %q", name)
	}
	return f, nil
}
