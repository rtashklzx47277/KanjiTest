package sql

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type PGSQL struct {
	db *sql.DB
}

type Question struct {
	Id          int
	Category    string
	Question    string
	Answer      string
	Explanation string
}

var (
	ErrUserDoesNotExist    = errors.New("user does not exist")
	ErrWrongPassword       = errors.New("incorrect password")
	ErrUsernameAlreadyUsed = errors.New("username is already taken")
	ErrEncodePassword      = errors.New("failed to encode password")
	ErrCreateAccount       = errors.New("failed to create account")
)

func ConnectToSQL(host, port, username, password, dbName string) (*PGSQL, error) {
	db, err := sql.Open("postgres", fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", host, port, username, password, dbName))
	if err != nil {
		return nil, fmt.Errorf("error connecting to MySQL!\n%v", err)
	}

	err = db.Ping()
	if err != nil {
		return nil, fmt.Errorf("database has no response!\n%v", err)
	}

	return &PGSQL{db}, nil
}

func (pg *PGSQL) GetQuestion(category string, lastId int, userId ...int) (int, string, string, string) {
	var id int
	var question, answer, explanation string

	var row *sql.Row
	if category == "bookmark" {
		row = pg.db.QueryRow(`SELECT q."Id", q."Question", q."Answer", q."Explanation" FROM public."Bookmarks" b INNER JOIN public."Questions" q ON b."QuestionId" = q."Id" WHERE b."UserId" = $1 AND q."Id" != $2 ORDER BY RANDOM() LIMIT 1`, userId[0], lastId)
	} else if category == "custom" {
		row = pg.db.QueryRow(`SELECT "Id", "Question", "Answer", "Explanation" FROM public."Questions" WHERE "From" = $1 AND "Id" != $2 ORDER BY RANDOM() LIMIT 1`, userId[0], lastId)
	} else if category == "all" {
		row = pg.db.QueryRow(`SELECT "Id", "Question", "Answer", "Explanation" FROM public."Questions" WHERE "Id" != $1 ORDER BY RANDOM() LIMIT 1`, lastId)
	} else {
		row = pg.db.QueryRow(`SELECT "Id", "Question", "Answer", "Explanation" FROM public."Questions" WHERE "Category" = $1 AND "Id" != $2 ORDER BY RANDOM() LIMIT 1`, category, lastId)
	}

	err := row.Scan(&id, &question, &answer, &explanation)
	if err == sql.ErrNoRows {
		fmt.Println("error")
		return 0, "", "", ""
	}

	return id, question, answer, explanation
}

func (pg *PGSQL) AddBookmark(userId, questionId int) bool {
	_, err := pg.db.Exec(`INSERT INTO public."Bookmarks" ("UserId", "QuestionId", "AddTime") VALUES ($1, $2, $3)`, userId, questionId, time.Now().UTC())
	return err == nil
}

func (pg *PGSQL) AddCustom(userId int, question, answer, explanation string) int {
	result, _ := pg.db.Exec(`INSERT INTO public."Questions" ("Category", "Question", "Answer", "Explanation", "From") VALUES ($1, $2, $3, $4, $5)`, "custom", question, answer, explanation, userId)
	questionId, _ := result.LastInsertId()
	return int(questionId)
}

func (pg *PGSQL) DeleteBookmark(userId int, questionId string) {
	pg.db.Exec(`DELETE FROM public."Bookmarks" WHERE "UserId" = $1 AND "QuestionId" = $2`, userId, questionId)
}

func (pg *PGSQL) DeleteCustom(userId int, questionId string) {
	pg.db.Exec(`DELETE FROM public."Questions" WHERE "From" = $1 AND "Id" = $2`, userId, questionId)
}

func (pg *PGSQL) GetBookmark(userId int) []Question {
	var bookmarks []Question

	rows, _ := pg.db.Query(`SELECT q."Id", q."Category", q."Question", q."Answer", q."Explanation" FROM public."Bookmarks" b INNER JOIN public."Questions" q ON b."QuestionId" = q."Id" WHERE b."UserId" = $1 ORDER BY b."AddTime" DESC`, userId)
	defer rows.Close()

	for rows.Next() {
		var bookmark Question
		rows.Scan(&bookmark.Id, &bookmark.Category, &bookmark.Question, &bookmark.Answer, &bookmark.Explanation)
		bookmarks = append(bookmarks, bookmark)
	}

	return bookmarks
}

func (pg *PGSQL) GetCustom(userId int) []Question {
	var customs []Question

	rows, _ := pg.db.Query(`SELECT "Id", "Question", "Answer", "Explanation" FROM public."Questions" WHERE "From" = $1 ORDER BY "Id" DESC`, userId)
	defer rows.Close()

	for rows.Next() {
		var custom Question
		rows.Scan(&custom.Id, &custom.Question, &custom.Answer, &custom.Explanation)
		customs = append(customs, custom)
	}

	return customs
}

func (pg *PGSQL) Login(username, password string) (int, error) {
	var userId int
	var pw string

	err := pg.db.QueryRow(`SELECT "Id", "Password" FROM public."Users" WHERE "Username" = $1`, username).Scan(&userId, &pw)
	if err == sql.ErrNoRows {
		return 0, ErrUserDoesNotExist
	}

	if err := bcrypt.CompareHashAndPassword([]byte(pw), []byte(password)); err != nil {
		return 0, ErrWrongPassword
	}

	return userId, nil
}

func (pg *PGSQL) Signup(username, password string) (int, error) {
	var user string

	err := pg.db.QueryRow(`SELECT "Username" FROM public."Users" WHERE "Username" = $1`, username).Scan(&user)
	if err == nil {
		return 0, ErrUsernameAlreadyUsed
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, ErrEncodePassword
	}

	result, err := pg.db.Exec(`INSERT INTO public."Users" ("Username", "Password") VALUES ($1, $2)`, username, hashedPassword)
	if err != nil {
		return 0, ErrCreateAccount
	}

	userId, _ := result.LastInsertId()

	return int(userId), nil
}
