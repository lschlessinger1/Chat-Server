function User(id, username) {
	this.id = id;
	this.username = username;
}

User.prototype.getId = function() {
	return this.id;
};

User.prototype.getUsername = function() {
	return this.username;
};

module.exports = User;