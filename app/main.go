package main

import (
	"KanjiTest/sql"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

var (
	db                            *sql.PGSQL
	category                      string = "all"
	id, lastId                    int
	question, answer, explanation string
)

func main() {
	var err error

	// db, err = sql.ConnectToSQL("localhost", "5432", "postgres", "root", "pgdb")
	db, err = sql.ConnectToSQL(os.Getenv("DB_HOST"), "5432", os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))
	if err != nil {
		log.Fatalf("error connecting to pgSQL!\n%v", err)
	}

	fmt.Println("Web is ready!")

	router := gin.Default()
	router.Static("/static", "./static")
	router.LoadHTMLGlob("templates/*")

	store := cookie.NewStore([]byte("secret"))
	router.Use(sessions.Sessions("mySession", store))

	router.GET("/", func(c *gin.Context) {
		category = "all"
		lastId = id

		var loginData template.HTML
		userName := sessions.Default(c).Get("UserName")
		if userName != nil {
			loginData = template.HTML(fmt.Sprintf(`<button class="login-data">歡迎, %v</button>`, userName))
		} else {
			loginData = template.HTML(`<button class="login-data" onclick="window.location.href='/login';">登入 / 註冊</button>`)
		}

		id, question, answer, explanation = db.GetQuestion(category, id)

		c.HTML(http.StatusOK, "index.html", gin.H{"question": question, "loginData": loginData})
	})

	router.GET("/login", func(c *gin.Context) {
		c.HTML(http.StatusOK, "login.html", nil)
	})

	router.POST("/changeCategory", changeCategory)
	router.POST("/checkAnswer", checkAnswer)
	router.POST("/addBookmark", addBookmark)
	router.POST("/addCustom", addCustom)
	router.POST("/loadContent", loadContent)
	router.POST("/login", login)
	router.POST("/signup", signup)
	router.DELETE("/deleteBookmark/:id", deleteBookmark)
	router.DELETE("/deleteCustom/:id", deleteCustom)

	router.Run(":8080")
}

func changeCategory(c *gin.Context) {
	var data struct {
		Category string `json:"category"`
	}
	c.BindJSON(&data)

	lastId = id

	if data.Category == "bookmark" || data.Category == "custom" {
		userId := sessions.Default(c).Get("UserId")
		if userId == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需登入才能使用此功能！"})
			return
		}

		id, question, answer, explanation = db.GetQuestion(data.Category, id, userId.(int))
	} else {
		id, question, answer, explanation = db.GetQuestion(data.Category, id)
	}

	if id == 0 {
		c.JSON(http.StatusOK, gin.H{"error": "此類別內沒有題目！"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"question": question})
}

func checkAnswer(c *gin.Context) {
	var data struct {
		YourAnswer string `json:"answer"`
	}
	c.BindJSON(&data)

	var solution, color string
	if data.YourAnswer == answer {
		solution, color = "正解！", "green"
	} else {
		solution, color = "不正解！", "red"
	}

	userId := sessions.Default(c).Get("UserId")
	userIdInt := 0

	if userId != nil {
		userIdInt = userId.(int)
	}

	tempQuestion, tempAnswer, tempExplanation := question, answer, explanation
	lastId = id
	id, question, answer, explanation = db.GetQuestion(category, id, userIdInt)

	c.JSON(http.StatusOK, gin.H{
		"solution":        solution,
		"color":           color,
		"lastQuestion":    tempQuestion,
		"lastAnswer":      tempAnswer,
		"yourLastAnswer":  data.YourAnswer,
		"lastExplanation": tempExplanation,
		"nextQuestion":    question,
	})
}

func loadContent(c *gin.Context) {
	var data struct {
		Type string `json:"type"`
	}
	c.BindJSON(&data)

	if data.Type == "bookmark" || data.Type == "custom" {
		userId := sessions.Default(c).Get("UserId")
		if userId == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需登入才能使用此功能！"})
			return
		}

		if data.Type == "bookmark" {
			bookmarks := db.GetBookmark(userId.(int))
			c.HTML(http.StatusOK, "bookmark.html", gin.H{"bookmarks": bookmarks})
		} else {
			customs := db.GetCustom(userId.(int))
			c.HTML(http.StatusOK, "custom.html", gin.H{"customs": customs})
		}
	} else {
		lastId = id
		id, question, answer, explanation = db.GetQuestion(category, id)
		c.HTML(http.StatusOK, "test.html", gin.H{"question": question})
	}
}

func addBookmark(c *gin.Context) {
	userId := sessions.Default(c).Get("UserId")
	if userId == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "需登入才能使用此功能！"})
		return
	}

	if ok := db.AddBookmark(userId.(int), lastId); ok {
		c.JSON(http.StatusOK, gin.H{"message": "已將此題目已加入書籤！"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "此題目已在書籤中！"})
	}
}

func addCustom(c *gin.Context) {
	var data struct {
		Question    string `json:"question"`
		Answer      string `json:"answer"`
		Explanation string `json:"explanation"`
	}
	c.BindJSON(&data)

	userId := sessions.Default(c).Get("UserId").(int)
	questionId := db.AddCustom(userId, data.Question, data.Answer, data.Explanation)
	c.JSON(http.StatusOK, gin.H{"questionId": questionId})
}

func deleteBookmark(c *gin.Context) {
	userId := sessions.Default(c).Get("UserId").(int)
	db.DeleteBookmark(userId, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"message": "刪除成功！"})
}

func deleteCustom(c *gin.Context) {
	userId := sessions.Default(c).Get("UserId").(int)
	db.DeleteCustom(userId, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"message": "刪除成功！"})
}

func login(c *gin.Context) {
	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	c.BindJSON(&data)

	userId, err := db.Login(data.Username, data.Password)
	if err != nil {
		if errors.Is(err, sql.ErrUserDoesNotExist) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "用戶不存在！"})
		} else if errors.Is(err, sql.ErrWrongPassword) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "密碼不正確！"})
		}
		return
	}

	session := sessions.Default(c)
	session.Set("UserId", userId)
	session.Set("UserName", data.Username)
	session.Save()

	c.JSON(http.StatusOK, gin.H{"message": "登入成功！"})
}

func signup(c *gin.Context) {
	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	c.BindJSON(&data)

	userId, err := db.Signup(data.Username, data.Password)
	if err != nil {
		if errors.Is(err, sql.ErrUsernameAlreadyUsed) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "使用者名稱已被使用！"})
		} else if errors.Is(err, sql.ErrEncodePassword) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "無法加密密碼！"})
		} else if errors.Is(err, sql.ErrCreateAccount) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "無法創建用戶！"})
		}
		return
	}

	session := sessions.Default(c)
	session.Set("UserId", userId)
	session.Set("UserName", data.Username)
	session.Save()

	lastId = id
	id, question, answer, explanation = db.GetQuestion(category, id, userId)
	c.JSON(http.StatusOK, gin.H{"message": "註冊成功！"})
}
