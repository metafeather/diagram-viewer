// Command manifest generates a build manifest from a D2 diagram directory,
// listing all source files and their render outputs.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	// Split args at "--" separator
	var flagArgs, passthrough []string
	for i, a := range args {
		if a == "--" {
			flagArgs = args[:i]
			passthrough = args[i+1:]
			break
		}
	}
	if passthrough == nil {
		flagArgs = args
	}

	fs := flag.NewFlagSet("manifest", flag.ContinueOnError)
	inPath := fs.String("in", "", "path to D2 diagram directory (required)")
	outDir := fs.String("out", "", "output directory (optional)")
	format := fs.String("format", "d2", "output format (default: d2)")

	if err := fs.Parse(flagArgs); err != nil {
		return 2
	}

	if *inPath == "" {
		fmt.Fprintln(os.Stderr, "error: --in is required")
		fs.Usage()
		return 2
	}

	f, err := LookupFormat(*format)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		return 2
	}

	// Render if --out was specified
	if *outDir != "" {
		if err := f.Render(*inPath, *outDir, passthrough); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			return 1
		}
	}

	root, err := f.Build(*inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		return 1
	}

	manifest := Manifest{
		Layers: []Node{*root},
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(manifest); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		return 1
	}

	return 0
}
