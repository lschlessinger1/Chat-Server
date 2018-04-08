function ChatRoom(name, id, owner) {
	this.id = id;
	this.name = name;
	this.owner = owner;
	this.users = [];
	this.bannedUsers = [];
	this.maxUsers = Number.POSITIVE_INFINITY;
	this.passwordProtected = false;
	this.password = null;
}

ChatRoom.prototype.isAvailable = function() {
  return this.available === "available";
};

ChatRoom.prototype.isPasswordProtected = function() {
  return this.passwordProtected;
};

ChatRoom.prototype.getActiveUserCount = function() {
  return this.users.length;
};

ChatRoom.prototype.addUser = function(user) {
	// check if this user already is in the chat
	for (var i = 0; i < this.users.length; i++) {
	    if (this.users[i].id == user.id) {
	        return;
	    }
	}

	this.users.push(user);
}

ChatRoom.prototype.removeUser = function(user) {
	for (var i = 0; i < this.users.length; i++) {
	    if (this.users[i].id == user.id) {
	        this.users.splice(i, 1);
	        break;
	    }
	}
}

ChatRoom.prototype.banUser = function(user) {
	for (var i = 0; i < this.bannedUsers.length; i++) {
	    if (this.bannedUsers[i].id == user.id) {
	        return;
	    }
	}

	this.bannedUsers.push(user);
}

module.exports = ChatRoom;