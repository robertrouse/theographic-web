import React from 'react';
import { useQuery } from '@apollo/react-hooks';
import Container from '@material-ui/core/Container';
import TextField from '@material-ui/core/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';
import gql from 'graphql-tag';

import SearchHints from './SearchHints';
import PeopleCards from './PeopleCards';
import PlacesCards from './PlacesCards';
import VersesCards from './VersesCards';

function SearchResults( {searchInput} ) {

  const { loading, error, data } = useQuery(SEARCH_QUERY, { 
    variables: { "input": searchInput },
    skip: searchInput.length < 3,
  });

  return (
    <>
        {loading && <LinearProgress color="secondary" />}
        {error && <p>Error: ${error.message}</p>}

        {searchInput.length <= 2 &&
            <SearchHints></SearchHints>
        }
        {data && data.searchPeople.length > 0 &&
            <PeopleCards people={data.searchPeople}></PeopleCards>
        }
        {data && data.searchPlaces.length > 0 && 
            <PlacesCards places={data.searchPlaces}></PlacesCards>
        }
        {data && data.searchVerses.length > 0 && 
            <VersesCards verses={data.searchVerses}></VersesCards>
        }                  
    </>
  );
};

class SearchPane extends React.Component {
  state = {
    searchInput: '',
  };

  searchInputChange = (e) => {
      this.setState({ searchInput: e.target.value })
  };

  render() {
    return (
      <Container maxWidth="sm">
        <TextField
          id="search-input"
          margin="dense"
          variant="outlined"
          value={this.state.searchInput}
          onChange={this.searchInputChange}
          autoFocus="true"
          fullWidth="true"
          color="primary"
        />
        <SearchResults searchInput={this.state.searchInput} ></SearchResults>
      </Container>
    );
  }
}

export default SearchPane

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