function Message(user, text, chatRoomId, sentAt){
	this.user = user; // from user
	this.text = text;
	this.chatRoomId = chatRoomId;
	this.sentAt = sentAt;
	this.isPrivate = false;
	this.toUser = ""; // to user
}

Message.prototype.getSentAt = function() {
	return this.sentAt;
};

Message.prototype.getText = function() {
	return this.text;
};

module.exports = Message;