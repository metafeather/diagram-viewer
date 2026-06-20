package main

import "testing"

func TestSlugify(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		// Spaces
		{"Control plane", "control-plane"},
		{"Pod Lifecycle", "pod-lifecycle"},

		// Mixed case
		{"MyDashboard", "my-dashboard"},
		{"ContainerLifeCycle", "container-life-cycle"},

		// Existing hyphens preserved
		{"kube-controller-manager", "kube-controller-manager"},
		{"already-kebab", "already-kebab"},

		// Leading/trailing punctuation trimmed
		{"--leading", "leading"},
		{"trailing--", "trailing"},
		{"---both---", "both"},
		{" spaced ", "spaced"},
		{"!bang!", "bang"},

		// Repeated separators collapsed
		{"a   b", "a-b"},
		{"a---b", "a-b"},
		{"a___b", "a-b"},
		{"a - b", "a-b"},

		// ASCII-folding
		{"café", "cafe"},
		{"naïve résumé", "naive-resume"},

		// Empty / minimal
		{"", ""},
		{"a", "a"},
		{"A", "a"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := slugify(tt.input)
			if got != tt.want {
				t.Errorf("slugify(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
