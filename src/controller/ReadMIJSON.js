//    xiNET interaction viewer
//    Copyright 2013 Rappsilber Laboratory
//
//    This product includes software developed at
//    the Rappsilber Laboratory (http://www.rappsilberlab.org/).
//
//    author: Colin Combe

"use strict";

var Polymer = require('../model/interactor/Polymer');
var NaryLink = require('../model/link/NaryLink');
var BinaryLink = require('../model/link/BinaryLink');
var UnaryLink = require('../model/link/UnaryLink');

// reads our MI JSON format 
var readMIJSON = function(miJson, controller) {

    //just check that we've got a parsed javacsript object here, not a String
    miJson = (typeof miJson === 'object') ? miJson : JSON.parse(miJson);
	
	//var interactorsMissingSequence = d3.set();
    
    // we iterate through the data three times, 
    // once for interactors, once for features, and once for interactions
    // (iteractors and interactions are mixed together in data,
	// features are conatined in interactions)
    
    var data = miJson.data;
    var dataElementCount = data.length;
    for (var n = 0; n < dataElementCount; n++) {
        if (data[n].object === 'interactor') {
            var interactor = data[n];
            var organismText = "no organism data";
            if (interactor.organism) {
                organismText = interactor.organism.scientific + '(' + interactor.organism.common + ')';
            }
            var description = interactor.type.name + ', '
                    + organismText + ', '
                    + interactor.identifier.id;

			var p;
             if (interactor.type.name === 'small molecule') {
				p = new SmallMol(interactor.id, this, interactor);
			 } else {
				p = new Polymer(interactor.id, this, interactor);
			 }
            this.interactors.set(interactor.id, p);
            if (typeof interactor.sequence !== 'undefined') {
                p.initInteractor(interactor.sequence, interactor.label, description);
            }
            else {
                //~ if (interactor.identifier.db === 'uniprotkb') {
                    //~ interactorsMissingSequence.add(interactor.identifier.id);
                //~ }
                //~ else {
                    p.initInteractor('NO_SEQUENCE', interactor.label, description);
                //~ }
            }
        }
    }
    var self = this;// the javascript bodge 

    //we will download missing sequences before doing second iteration to add links
    //~ if (interactorsMissingSequence.values().length === 0) {//if no missing sequences
        addInteractions();
		//~ this.message(this.links);
    //~ }
    //~ else {
        //~ this.message(interactorsMissingSequence);
        //~ initProteinSequences();//calls addInteractions when complete
    //~ }
    
    function addInteractions() {
        var width = self.svgElement.parentNode.clientWidth;
        Polymer.UNITS_PER_RESIDUE = ((width / 2)) / 4000;//((Interactor.MAXSIZE < 5000)? Interactor.MAXSIZE : 5000);
        var interactors = self.interactors.values();
        var proteinCount = interactors.length;
        self.features = d3.map();       
        for (var l = 0; l < dataElementCount; l++) {
            var interaction = data[l];
            if (interaction.object === 'interaction') {
                self.addFeatures(interaction);
            }
        }
        for (var l = 0; l < dataElementCount; l++) {
            var interaction = data[l];
            if (interaction.object === 'interaction') {
                self.addInteraction(interaction);
            }
        }
        for (var p = 0; p < proteinCount; p++) {
            var prot = interactors[p];
            prot.setPositionalFeatures(prot.customAnnotations);
        }
        self.init();
        self.checkLinks();
    }
};

var addFeatures = function(interaction) {
    var participantCount = interaction.participants.length;
    var pIDs = d3.set();
    for (var pi = 0; pi < participantCount; pi++) {
		var participant = interaction.participants[pi];
		var pID = participant.interactorRef;
		var interactor = this.interactors.get(pID);
		if (typeof interactor === 'undefined') {
			alert("Fail - no interactor with id " + pID);
		}
		if (participant.bindingSites) {
			var efCount = participant.bindingSites.length;
			for (var ef = 0; ef < efCount; ef++){
				var experimentalFeature = participant.bindingSites[ef];
				interactor.features.set(experimentalFeature.id, experimentalFeature);
				this.features.set(experimentalFeature.id, 
					{interactor:interactor.id,
					 feature:experimentalFeature});
				interactor.addFeature(experimentalFeature);	
			}	
		}		
	}	
};

// Moved from Link.js
//id is particpant interactorRefs, in ascending order, with duplicates eliminated, seperated by dash
var getIdFromInteraction = function(interaction){
    var linkId = "";
    //sort participants by interactorRef
    var participants = interaction.participants.sort(
        function comparator(a, b) {
            return a.interactorRef - b.interactorRef;
        }
    );
    var participantCount = participants.length;
    var pIDs = d3.set();//used to eliminate duplicates
    for (var pi = 0; pi < participantCount; pi++) {
        var pID = participants[pi].interactorRef;
        if (pIDs.has(pID) === false){
            pIDs.add(pID);
            if (pi > 0) {
                linkId += "-"; 
            }
            linkId += pID;
        }
    }
    return linkId;  
}

var addInteraction = function(interaction) {

    if (typeof interaction.identifiers === 'undefined' || interaction.identifiers.length === 0){
        alert('missing interaction identifier');
        console.error(JSON.stringify(interaction));
    }
    
    if (typeof interaction.confidences !== 'undefined') {
        var confidences = interaction.confidences;
        var confCount = confidences.length;
        for (var c = 0; c < confCount; c++){
            var conf = confidences[c];
            if (conf.type === 'intact-miscore'){
                interaction.score = conf.value * 1.0;
            }
        }
    }
    
	var linkId = getIdFromInteraction(interaction);
	var link = this.links.get(linkId);
	
	var interactorIds = linkId.split('-');
	
    if (typeof link === 'undefined') {
		//~ var participants = interaction.participants;
		//~ var participantCount = participants.length; //...no
		var participantCount = interactorIds.length;
		if (participantCount === 1) {
			link = new UnaryLink(linkId, this);
			link.notSubLink = true;
		} else if (participantCount === 2) {
			var participants = interaction.participants.sort(
			function comparator(a, b) {
				return a.interactorRef - b.interactorRef;
				}
			);		
			link = new BinaryLink(linkId, this, 
				this.interactors.get(interactorIds[0]),
				this.interactors.get(interactorIds[1]));
			link.notSubLink = true;
		} else {
			link = new NaryLink(linkId, this);
		}
        this.links.set(linkId, link);
		for (var pi = 0; pi < participantCount; pi++) {
			this.interactors.get(interactorIds[pi]).addLink(link);
		}
	}
    //all other initialisation to do with links takes place within Links 
    link.addEvidence(interaction);
};

var toJSON = function() {
    return {
        interactors: this.interactors,
        features: this.features,
		links: this.links,
    };
};

    //~ function initProteinSequences() {
        //~ var server_url = 'http://www.ebi.ac.uk/das-srv/uniprot/das/uniprot/';
        //~ var client = JSDAS.Simple.getClient(server_url);
        //~ // This function will be executed in case of error
        //~ var error_response = function(e) {
            //~ //we need to parse id out of URL, this is not ideal
            //~ var id = e.url.substring(e.url.lastIndexOf('=') + 1);
            //~ console.error('Sequence DAS lookup FAILED for ' + id);
            //~ console.error(e.url);
            //~ var p = self.interactors.get(id);
            //~ p.initProtein('MISSING');
            //~ interactorsMissingSequence.remove(id);
            //~ self.message('<p>Waiting on sequence DAS response for: '
                    //~ + interactorsMissingSequence.values().toString() + '</p>');
            //~ if (interactorsMissingSequence.values().length === 0) {
                //~ self.message('<p>All DAS sequence queries returned</p>');
                //~ addInteractions();
			//~ //	this.message(this);
            //~ }
        //~ };
        //~ 
        //~ // This function inits the protein with sequence
        //~ var response = function(res) {
            //~ var id = res.SEQUENCE[0].id;
            //~ var seq = res.SEQUENCE[0].textContent;
            //~ var label = res.SEQUENCE[0].label;
            //~ var prot = self.interactors.get(id);
            //~ prot.initProtein(seq, label, id);
            //~ interactorsMissingSequence.remove(id);
            //~ self.message('<p>Waiting on sequence DAS response for: '
                    //~ + interactorsMissingSequence.values().toString() + '</p>');
            //~ if (interactorsMissingSequence.values().length === 0) {
                //~ self.message('<p>All sequences downloaded from DAS</p>');
                //~ addInteractions();
            //~ }
        //~ };
//~ 
        //~ //send off the DAS sequence requests
        //~ var keys = interactorsMissingSequence.values();
        //~ var proteinCount = keys.length;
        //~ for (var p = 0; p < proteinCount; p++) {
            //~ var accession = keys[p];
            //~ //Asking the client to retrieve the sequence
            //~ client.sequence({
                //~ segment: accession
            //~ }, response, error_response);
        //~ }
    //~ }

module.exports = {readMIJSON: readMIJSON, addFeatures: addFeatures, addInteraction: addInteraction, toJSON: toJSON};