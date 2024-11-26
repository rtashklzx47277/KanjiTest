let answerTimer
let bookmarkTimer
const $ = (element) => document.querySelector(element)
const $$ = (element) => document.querySelectorAll(element)

$("#toggle-button").addEventListener("click", () => {
  const sidebar = $("#sidebar")
  const toggle = $("#toggle-button")

  if (sidebar.classList.contains("collapsed")) {
    sidebar.classList.remove("collapsed")
    toggle.classList.remove("collapsed")
    toggle.innerText = "關閉側邊選單"
  } else {
    sidebar.classList.add("collapsed")
    toggle.classList.add("collapsed")
    toggle.innerText = "開啟側邊選單"
  }
})

$$("li[id]").forEach(element => {
  element.addEventListener("click", (event) => {
    event.preventDefault()

    fetch("/loadContent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: element.id.split("-")[0] })
    })
    .then(response => {
      if (response.headers.get('Content-Type').includes('application/json')) {
        return response.json().then(data => { alert(data.error) })
      }

      return response.text().then(html => { $("#main-content").innerHTML = html })
    })
    .catch(error => console.error("Error:", error))
  })
})

$("#main-content").addEventListener("change", (event) => {
  if (event.target.name === "category") changeCategory(event.target.value)
})

$("#main-content").addEventListener("keyup", (event) => {
  if (event.key !== "Enter") return
  if (event.target.id === "yourAnswer") checkAnswer()
  else if (event.target.id === "bookmark-filter" || event.target.id === "custom-filter") filterTable(event.target)
})

$("#main-content").addEventListener("click", (event) => {
  if (event.target.id === "create-custom-button") openLayer()
  else if (event.target.id === "close-icon") closeLayer()
  else if (event.target.id === "add-bookmark-button") addBookmark()
})

$("#main-content").addEventListener("submit", (event) => {
  if (event.target.id === "custom-form") {
    event.preventDefault()
    addCustom()
    closeLayer()
  }
})

window.addEventListener("click", (event) => {
  if (event.target.matches("#custom-layer")) closeLayer()
})

const changeCategory = (category) => {
  fetch("/changeCategory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: category })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      alert(data.error)
      return
    }
  
    $("#question").innerText = data.question
    $("#yourAnswer").value = ""
  })
  .catch(error => console.error("Error:", error))
}

const checkAnswer = () => {
  const input = $("#yourAnswer")

  if (input.value.trim() === "") {
    const tooltip = $("#answer-tooltip")
    tooltip.style.display = "block"

    if (answerTimer) clearTimeout(answerTimer)
    answerTimer = setTimeout(() => {
      tooltip.style.display = "none"
    }, 2000)

    return
  }

  fetch("/checkAnswer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: input.value })
  })
  .then(response => response.json())
  .then(data => {
    $("#solution").innerText = " " + data.solution
    $("#solution").style.color = data.color
    $("#lastQuestion").innerText = " " + data.lastQuestion
    $("#lastAnswer").innerText = " " + data.lastAnswer
    $("#yourLastAnswer").innerText = " " + data.yourLastAnswer
    $("#lastExplanation").innerText = " " + data.lastExplanation
    $("#question").innerText = data.nextQuestion
    $("#yourAnswer").value = ""
    $("#add-bookmark-button").style.display = "block"
  })
  .catch(error => console.error("Error:", error))
}

const filterTable = (element) => {
  const filterText = element.value.toLowerCase()

  var rows
  if (element.id === "bookmark-filter") rows = $$("#bookmark-table tbody tr")
  else rows = $$("#custom-table tbody tr")

  rows.forEach(row => {
    const cells = Array.from(row.getElementsByTagName("td"))
    const rowText = cells.map(cell => cell.textContent.toLowerCase()).join(" ")
    row.style.display = rowText.includes(filterText) ? "" : "none"
  })
}

const openLayer = () => {
  $("#custom-layer").style.display = "block"
}

const closeLayer = () => {
  $("#custom-layer").style.display = "none"
}

const addBookmark = () => {
  fetch("/addBookmark", {
    method: "POST",
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      alert(data.error)
      return
    }

    const tooltip = $("#bookmark-tooltip")
    tooltip.innerText = data.message
    tooltip.style.display = "block"

    if (bookmarkTimer) clearTimeout(bookmarkTimer)
    bookmarkTimer = setTimeout(() => {
      tooltip.style.display = "none"
    }, 2000)
  })
  .catch(error => console.error("Error:", error))
}

const addCustom = () => {
  const question = $("#custom-question")
  const answer = $("#custom-answer")
  const explanation = $("#custom-explanation")

  if (!question.value || !answer.value || !explanation.value) {
    if (!question.value) question.classList.add("error")
    if (!answer.value) answer.classList.add("error")
    if (!explanation.value) explanation.classList.add("error")
    $("#custom-form p.message").innerText = "每個欄位都必須填寫！"
    return
  }

  fetch("/addCustom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: question.value, answer: answer.value, explanation: explanation.value })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      alert(data.error)
      return
    }

    const tableBody = $("#custom-table tbody")
    const newRow = document.createElement("tr")
    
    newRow.innerHTML = `
      <td>${question.value}</td>
      <td>${answer.value}</td>
      <td>${explanation.value}</td>
      <td class="delete">
        <button type="button" class="delete-button" onclick="deleteData('deleteCustom', this, ${data.questionId})">
          🗑️
        </button>
      </td>
    `

    tableBody.insertBefore(newRow, tableBody.firstChild)

    question.value = ""
    answer.value = ""
    explanation.value = ""
    question.classList.remove("error")
    answer.classList.remove("error")
    explanation.classList.remove("error")
    $("#custom-form p.message").innerText = ""
  })
  .catch(error => console.error("Error login:", error))
}

const deleteData = (type, button, questionId) => {
  fetch(`/${type}/${questionId}`, {
    method: "DELETE"
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      alert(data.error)
      return
    }

    button.closest("tr").remove()
  })
  .catch(error => console.error("Error:", error))
}
