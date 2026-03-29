package main

import (
	"fmt"
	"log"
	"net/http"

	"vcp-analyzer/internal/api"
)

func main() {
	router := api.NewRouter()

	port := "8090"
	fmt.Printf("VCP Analyzer backend listening on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, router))
}
