package main

// d2Format is the default Format implementation backed by the d2 tool.
// Full implementation is in a subsequent issue.
type d2Format struct{}

func (d2Format) Build(inPath string) (*Node, error) {
	// TODO: implement in next issue (i-519l)
	return nil, nil
}

func (d2Format) Render(inPath, outDir string, passthrough []string) error {
	// TODO: implement in next issue (i-519l)
	return nil
}

func init() {
	RegisterFormat("d2", d2Format{})
}
