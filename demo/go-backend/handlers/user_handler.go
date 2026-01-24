package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/example/go-backend/models"
	"github.com/example/go-backend/repository"
)

// ErrUserNotFound is returned when a user is not found
var ErrUserNotFound = errors.New("user not found")

// ErrInvalidInput is returned when input validation fails
var ErrInvalidInput = errors.New("invalid input")

// GetUsers returns all users
func GetUsers(c *gin.Context) {
	users, err := repository.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, users)
}

// GetUser returns a single user by ID
func GetUser(c *gin.Context) {
	id := c.Param("id")
	
	user, err := repository.GetUserByID(id)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, user)
}

// CreateUser creates a new user
func CreateUser(c *gin.Context) {
	var input models.CreateUserInput
	
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Errorf("invalid input: %w", err).Error()})
		return
	}
	
	user, err := repository.CreateUser(&input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusCreated, user)
}

// UpdateUser updates an existing user
func UpdateUser(c *gin.Context) {
	id := c.Param("id")
	var input models.UpdateUserInput
	
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	user, err := repository.UpdateUser(id, &input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, user)
}

// DeleteUser deletes a user
func DeleteUser(c *gin.Context) {
	id := c.Param("id")
	
	if err := repository.DeleteUser(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(http.StatusNoContent, nil)
}
