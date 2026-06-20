package main

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// slugify converts a board name to a kebab-case ID suitable for use as a
// manifest id. It lowercases, ASCII-folds, replaces runs of non-alphanumeric
// characters with a single hyphen, and trims leading/trailing hyphens.
//
// Examples:
//
//	"Control plane"          → "control-plane"
//	"kube-controller-manager" → "kube-controller-manager"
//	"Pod Lifecycle"          → "pod-lifecycle"
func slugify(s string) string {
	// Insert hyphen at camelCase boundaries
	var buf strings.Builder
	runes := []rune(s)
	for i, r := range runes {
		if unicode.IsUpper(r) && i > 0 {
			prev := runes[i-1]
			if unicode.IsLower(prev) || unicode.IsDigit(prev) {
				buf.WriteRune('-')
			}
		}
		buf.WriteRune(r)
	}
	result := buf.String()

	// Lowercase
	result = strings.ToLower(result)

	// ASCII-fold: decompose unicode then strip non-ASCII marks
	result = asciiFold(result)

	// Replace runs of non-alphanumeric characters with a single hyphen
	result = reNonAlnum.ReplaceAllString(result, "-")

	// Trim leading/trailing hyphens
	return strings.Trim(result, "-")
}

var reNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// asciiFold decomposes unicode characters (NFD) and drops combining marks,
// effectively converting accented characters to their ASCII base.
func asciiFold(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		if r < 128 {
			b.WriteRune(r)
		}
		// Skip combining marks (accents etc.)
	}
	return b.String()
}
