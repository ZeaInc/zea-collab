import { VisualiveSession } from '@visualive/collab'

const urlParams = new URLSearchParams(window.location.search)
const projectIdFromUrl = urlParams.get('project-id')
const fileIdFromUrl = urlParams.get('file-id')
const roomIdFromUrl = urlParams.get('room-id')
const tokenFromUrl = urlParams.get('token')

const $receivedMessages = document.getElementById('receivedMessages')
const $mediaWrapper = document.getElementById('mediaWrapper')

const visualiveSession = new VisualiveSession()

visualiveSession.join({
  projectId: projectIdFromUrl,
  fileId: fileIdFromUrl,
  roomId: roomIdFromUrl,
  userId: tokenFromUrl,
})

document.formSendMessage.addEventListener('submit', e => {
  e.preventDefault()
  const $form = e.target
  visualiveSession.sendTextMessage($form.messageToSend.value)
  $form.reset()
})

visualiveSession.on(VisualiveSession.actions.TEXT_MESSAGE, message => {
  const p = document.createElement('p')
  p.innerHTML = `<strong>${message.userId}:</strong> ${message.payload.text}`
  $receivedMessages.appendChild(p)
})

visualiveSession.on(VisualiveSession.actions.USER_JOINED, message => {
  const p = document.createElement('p')
  p.innerHTML = `<strong>(User Joined: ${message.userId})</strong>`
  $receivedMessages.appendChild(p)
})
