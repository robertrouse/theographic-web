import React, { Component } from 'react';
import { View, StyleSheet, TextInput, ScrollView } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
import gql from 'graphql-tag';
import { Card } from 'native-base';

import PeopleComponent from './PeopleComponent';
import PlacesComponent from './PlacesComponent';
import VersesComponent from './VersesComponent';

import HomeComponent from './HomeComponent';

export default class PrincipalComponent extends Component {
    constructor(props) {
        super(props);
    }

    state = {
        inputSearch: '',
        people: [],
        places: [],
        verses: [],

    };

    inputSearchChange = (inputSearch) => {
        this.setState({ inputSearch })
        if (inputSearch.length > 2) {
            this.props.client.query({
                query: SEARCH_QUERY,
                variables: { "input": inputSearch }
            }).then(response => {
                this.setState({ 
                    people: response.data.searchPeople,
                    places: response.data.searchPlaces,
                    verses: response.data.searchVerses
                })
            })

        } else {
            this.setState({ 
                people: [],
                places: [],
                verses: []
            })
        }
    }

    render() {
        const shadowStyle = {
            width: 100,
            height: 100,
            color: "#000",
            border: 2,
            radius: 3,
            opacity: 0.2,
            x: 0,
            y: 3,
            style: { marginVertical: 5 },
        }

        return (
            <View>
                <Card>
                    <View style={{ position: "relative" }}>
                        <TextInput style={styles.inputSearch}
                            onChangeText={(inputSearch) => this.inputSearchChange(inputSearch)}
                            value={this.state.inputSearch}></TextInput>
                        {/* <Ionicons style={styles.iconSearch} name="ios-search" size={20} color="#707070" /> */}
                    </View>
                </Card>


        
                <ScrollView style={{ paddingTop: 10, paddingBottom: 20 }}>
                    {this.state.inputSearch.length <= 2 &&
                        <HomeComponent></HomeComponent>
                    }
                    {/* {this.state.people.length > 0 && 
                        <PeopleComponent people={this.state.people} query={this.state.inputSearch}></PeopleComponent>
                    }
                    {this.state.places.length > 0 && 
                        <PlacesComponent places={this.state.places} query={this.state.inputSearch}></PlacesComponent>
                    }
                    {this.state.verses.length > 0 && 
                        <VersesComponent verses={this.state.verses} query={this.state.inputSearch}>{this.state.inputSearch}</VersesComponent>
                    }                   */}
                </ScrollView>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    inputSearch: {
        height: 40,
        fontFamily: 'Roboto',
        paddingLeft: 40,
    },
    iconSearch: {
        position: "absolute",
        top: 10,
        left: 10,
    },
})

const SEARCH_QUERY = gql`
query searchResults ($input:String!) {
    searchPeople(input:$input, first:2){
        name  
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }
    searchPlaces(input:$input, first:2){
        name
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }              
    searchVerses(input:$input, first:10){
        verseText  
        verseId
        fullRef
        osisRef
    }
}
`


