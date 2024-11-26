const $ = (element) => document.querySelector(element)

$("#login-tab-button").addEventListener("click", () => {
  $("#login-tab-button").classList.add("active")
  $("#signup-tab-button").classList.remove("active")
  $("#login-form").classList.add("active")
  $("#signup-form").classList.remove("active")
  $("#signup-form #username").value = ""
  $("#signup-form #password").value = ""
  $("#signup-form #confirmPassword").value = ""
  $("#signup-form #username").classList.remove("error")
  $("#signup-form #password").classList.remove("error")
  $("#signup-form #confirmPassword").classList.remove("error")
  $("#signup-form p.message").innerText = ""
})

$("#signup-tab-button").addEventListener("click", () => {
  $("#login-tab-button").classList.remove("active")
  $("#signup-tab-button").classList.add("active")
  $("#login-form").classList.remove("active")
  $("#signup-form").classList.add("active")
  $("#login-form #username").value = ""
  $("#login-form #password").value = ""
  $("#login-form #username").classList.remove("error")
  $("#login-form #password").classList.remove("error")
  $("#login-form p.message").innerText = ""
})

$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault() 
  
  const username = $("#login-form #username")
  const password = $("#login-form #password")

  if (!username.value || !password.value) {
    if (!username.value) username.classList.add("error")
    if (!password.value) password.classList.add("error")
    $("#login-form p.message").innerText = "使用者名稱和密碼都必須填寫！"
    return
  }

  fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.value, password: password.value })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) alert(data.error)
    else window.location.href = "/"
  })
  .catch(error => console.error("Error login:", error))
})

$("#signup-form").addEventListener("submit", (event) => {
  event.preventDefault() 
  
  const username = $("#signup-form #username")
  const password = $("#signup-form #password")
  const confirmPassword = $("#signup-form #confirmPassword")

  if (!username.value || !password.value || !confirmPassword.value) {
    if (!username.value) username.classList.add("error")
    if (!password.value) password.classList.add("error")
    if (!confirmPassword.value) confirmPassword.classList.add("error")
    $("#signup-form p.message").innerText = "使用者名稱和密碼都必須填寫！"
    return
  }

  if (password.value != confirmPassword.value) {
    alert("密碼不一致")
    return
  }

  fetch("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.value, password: password.value })
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) alert(data.error)
    else window.location.href = "/"
  })
  .catch(error => console.error("Error:", error))
})
