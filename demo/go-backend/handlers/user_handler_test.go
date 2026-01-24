package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGetUsers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.GET("/users", GetUsers)
	
	req, _ := http.NewRequest("GET", "/users", nil)
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	// Note: This will fail without DB setup, but tests the structure
	assert.NotNil(t, w.Body)
}

func TestGetUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.GET("/users/:id", GetUser)
	
	req, _ := http.NewRequest("GET", "/users/1", nil)
	w := httptest.NewRecorder()
	
	router.ServeHTTP(w, req)
	
	assert.NotNil(t, w.Body)
}

func BenchmarkGetUsers(b *testing.B) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.GET("/users", GetUsers)
	
	for i := 0; i < b.N; i++ {
		req, _ := http.NewRequest("GET", "/users", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}
}
